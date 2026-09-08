// src/modulos/requerimientos/requerimientos.servicio.js
//
// HU-81 — el pedido interno que arranca el ciclo de compra: un depósito
// pide reponer uno o varios artículos. Puede cargarse a mano o salir de
// una alerta de stock mínimo (HU-8, Sprint 1), que es el mismo alta con
// origen: "ALERTA" — no hay un endpoint aparte.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const {
  ESTADOS_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  TIPOS_REQUERIMIENTO,
  CATEGORIAS_REQUERIMIENTO,
  estadosDeCategoria,
  OPCIONES_TRANSACCION,
} = require("../../lib/constantes");

class ErrorDeNegocio extends Error {
  // `extra` es opcional — hoy solo lo usa el caso de "artículo sin central
  // asignado" (articuloId), para que el frontend arme un link directo a su
  // edición en el catálogo en vez de mandar a la persona a buscarlo a mano.
  constructor(message, statusCode = 400, extra = {}) {
    super(message);
    this.name = "ErrorDeNegocio";
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

// RequerimientoLog.accion es un String de Prisma sin @db.Text -> VARCHAR(191)
// en MySQL. Los mensajes de acá arriba interpolan listas de artículos o
// mensajes de error ajenos (largo variable, no acotado por el código que
// los arma), así que se truncan a mano en vez de confiar en que siempre
// entren — un log recortado es un problema menor; un P2000 que aborta la
// transacción entera no lo es.
function truncarAccion(texto) {
  return texto.length > 190 ? `${texto.slice(0, 189)}…` : texto;
}

const INCLUDE_DETALLE = {
  deposito: { select: { id: true, nombre: true } },
  depositoCentral: { select: { id: true, nombre: true } },
  detalle: {
    // categoria: la necesita SolicitarPresupuestosModal (frontend) para
    // saber qué rubros del padrón cubren este pedido — sin ella, todo
    // proveedor cae en el fallback "sin categoría, se muestra habilitado".
    include: { articulo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true, categoria: true } } },
    orderBy: { id: "asc" },
  },
};

async function crearRequerimiento({ depositoId, origen, solicitante, detalle, tipo, urgente }) {
  const tipoFinal = tipo || TIPOS_REQUERIMIENTO.COMPRA;
  if (!Object.values(TIPOS_REQUERIMIENTO).includes(tipoFinal)) {
    throw new ErrorDeNegocio(`tipo inválido. Valores permitidos: ${Object.values(TIPOS_REQUERIMIENTO).join(", ")}`, 400);
  }

  const deposito = await prisma.deposito.findUnique({ where: { id: depositoId } });
  if (!deposito) throw new ErrorDeNegocio("El depósito indicado no existe", 404);
  if (!deposito.activo) throw new ErrorDeNegocio("El depósito está dado de baja", 400);

  // Dos líneas del mismo artículo romperían el @@unique(requerimientoId,
  // articuloId) recién en el insert, con un P2002 que no dice la causa
  // real. Mismo criterio que cargarPresupuesto en presupuestos.servicio.js.
  const ids = detalle.map((d) => d.articuloId);
  if (new Set(ids).size !== ids.length) {
    throw new ErrorDeNegocio("Hay artículos repetidos en el detalle: cargá una sola línea por artículo", 400);
  }

  const articulos = await prisma.articulo.findMany({ where: { id: { in: ids } } });
  if (articulos.length !== ids.length) {
    throw new ErrorDeNegocio("Alguno de los artículos indicados no existe", 404);
  }
  const inactivo = articulos.find((a) => !a.activo);
  if (inactivo) {
    throw new ErrorDeNegocio(`El artículo "${inactivo.nombre}" está dado de baja y no puede pedirse`, 400);
  }

  // Sprint 3 — Transferencia a Central: a diferencia de COMPRA, acá el
  // "proveedor" lo elige el sistema (el central del artículo), no la
  // persona. Por eso todas las líneas tienen que apuntar al mismo central
  // — si no, no hay un único destino posible y hay que dividir el pedido.
  let depositoCentralId = null;
  let estadoInicial = ESTADOS_REQUERIMIENTO.PENDIENTE;
  if (tipoFinal === TIPOS_REQUERIMIENTO.TRANSFERENCIA) {
    if (deposito.esCentral) {
      throw new ErrorDeNegocio("Un depósito central no puede pedirse una transferencia a sí mismo", 400);
    }
    const sinCentral = articulos.find((a) => a.depositoCentralId == null);
    if (sinCentral) {
      throw new ErrorDeNegocio(
        `El artículo "${sinCentral.nombre}" no tiene un depósito central asignado — asignaselo en el catálogo antes de pedirlo por transferencia`,
        400,
        { articuloId: sinCentral.id }
      );
    }
    const centrales = new Set(articulos.map((a) => a.depositoCentralId));
    if (centrales.size > 1) {
      throw new ErrorDeNegocio(
        "Los artículos de esta solicitud apuntan a distintos depósitos centrales — dividí el pedido en una solicitud por central",
        400
      );
    }
    depositoCentralId = [...centrales][0];

    // `Articulo.depositoCentralId` y la habilitación real en ese depósito
    // (ArticuloDeposito.activo) son dos datos independientes — un artículo
    // puede tener el central asignado en el catálogo pero no estar (o ya no
    // estar) habilitado ahí. Sin este chequeo, un requerimiento como este
    // pasa la validación de arriba y termina en "Pendiente de stock" sin
    // que quede claro que el problema es la habilitación, no el stock (bug
    // reportado: JABON TOCADOR DOVE con central asignado pero deshabilitado
    // en Central Secos/Insumos).
    const habilitacionesCentral = await prisma.articuloDeposito.findMany({
      where: { depositoId: depositoCentralId, articuloId: { in: articulos.map((a) => a.id) } },
    });
    const noHabilitadoEnCentral = articulos.find((a) => {
      const hab = habilitacionesCentral.find((h) => h.articuloId === a.id);
      return !hab || !hab.activo;
    });
    if (noHabilitadoEnCentral) {
      const central = await prisma.deposito.findUnique({ where: { id: depositoCentralId }, select: { nombre: true } });
      throw new ErrorDeNegocio(
        `El artículo "${noHabilitadoEnCentral.nombre}" no está habilitado en su depósito central (${central?.nombre ?? "—"}) — pedile a depósito que lo habilite ahí`,
        400,
        { articuloId: noHabilitadoEnCentral.id, depositoCentralId }
      );
    }
  } else if (!deposito.esCentral) {
    // Se eliminó la excepción de "compra directa" desde un depósito
    // periférico (antes pedía aprobación de gerencia; ahora directamente
    // no existe como camino). Un periférico solo puede pedir por
    // TRANSFERENCIA — el tipo ya no es una opción que el frontend pueda
    // forzar a COMPRA para saltarse el central.
    throw new ErrorDeNegocio(
      "Un depósito periférico solo puede generar solicitudes de tipo TRANSFERENCIA — la compra directa a proveedor no está disponible.",
      400
    );
  }

  // Cabecera + N líneas = 2 tablas, así que va en transacción (Guía
  // Técnica, sección 0): si falla el detalle no puede quedar un
  // requerimiento vacío dando vueltas.
  const creado = await prisma.$transaction(async (tx) => {
    const requerimiento = await tx.requerimientoReposicion.create({
      data: {
        depositoId,
        origen,
        solicitante: solicitante || null,
        estado: estadoInicial,
        tipo: tipoFinal,
        urgente: Boolean(urgente),
        depositoCentralId,
      },
    });
    await tx.requerimientoDetalle.createMany({
      data: detalle.map((d) => ({
        requerimientoId: requerimiento.id,
        articuloId: d.articuloId,
        cantidadSolicitada: d.cantidadSolicitada,
      })),
    });
    await tx.requerimientoLog.create({
      data: { requerimientoId: requerimiento.id, usuario: solicitante || "sistema", accion: `Solicitud creada — ${estadoInicial}` },
    });

    // Sprint 3 — motor de transferencia: intenta reservar stock del
    // central ahí mismo, en la misma transacción que crea la solicitud.
    // Si no alcanza, intentarAprobarTransferencia la deja en "Pendiente
    // de stock" y dispara la reposición del central — nunca se propaga un
    // error por falta de stock, es un desenlace normal, no una falla.
    if (tipoFinal === TIPOS_REQUERIMIENTO.TRANSFERENCIA) {
      await intentarAprobarTransferencia(tx, {
        id: requerimiento.id,
        depositoId,
        depositoCentralId,
        urgente: Boolean(urgente),
        detalle,
      });
    }

    return requerimiento;
  }, OPCIONES_TRANSACCION);

  // Relectura con include fuera del commit (ver OPCIONES_TRANSACCION).
  return prisma.requerimientoReposicion.findUnique({ where: { id: creado.id }, include: INCLUDE_DETALLE });
}

// Sprint 3 — motor de transferencia (punto 3 y 6 del diseño). Recibe un
// `tx` ya abierto (se llama desde dentro de la transacción de
// crearRequerimiento, y también desde el hook de recepción de OC del
// central) y el requerimiento con su `detalle` en la forma
// [{ articuloId, cantidadSolicitada }].
//
// Todo o nada: si falta stock de un solo artículo, no se reserva ninguna
// línea todavía — más simple y menos sorpresivo que dejar una
// transferencia "a medias". Primero se lee el stock disponible de cada
// línea (sin tocar nada) y recién si TODAS alcanzan se decrementa.
async function intentarAprobarTransferencia(tx, requerimiento) {
  const articuloIds = requerimiento.detalle.map((d) => d.articuloId);

  // Validaciones que, si fallan, no se arreglan solas reponiendo stock —
  // hace falta que alguien las corrija a mano (rehabilitar el artículo en
  // destino, o reactivarlo si está dado de baja). Se chequean antes que el
  // stock para no reservar en el central algo que después va a rebotar en
  // confirmarRecepcion sin ninguna forma de deshacer la reserva.
  const [articulosInfo, habilitacionesDestino] = await Promise.all([
    tx.articulo.findMany({ where: { id: { in: articuloIds } } }),
    tx.articuloDeposito.findMany({
      where: { depositoId: requerimiento.depositoId, articuloId: { in: articuloIds }, activo: true },
    }),
  ]);
  const dadosDeBaja = articulosInfo.filter((a) => !a.activo);
  const habilitadosDestinoIds = new Set(habilitacionesDestino.map((h) => h.articuloId));
  const sinHabilitarDestino = articuloIds.filter((id) => !habilitadosDestinoIds.has(id));
  if (dadosDeBaja.length > 0 || sinHabilitarDestino.length > 0) {
    await tx.requerimientoReposicion.update({
      where: { id: requerimiento.id },
      data: { estado: ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK },
    });
    await tx.requerimientoLog.create({
      data: {
        requerimientoId: requerimiento.id,
        usuario: "sistema",
        accion: truncarAccion(
          `Bloqueada, requiere revisión manual: ${[
            ...dadosDeBaja.map((a) => `"${a.nombre}" dado de baja`),
            ...sinHabilitarDestino.map((id) => `artículo ${id} sin habilitar en destino`),
          ].join("; ")}`
        ),
      },
    });
    return;
  }

  const habilitacionesCentral = await tx.articuloDeposito.findMany({
    where: { depositoId: requerimiento.depositoCentralId, articuloId: { in: articuloIds } },
    include: { stock: true },
  });
  const porArticulo = Object.fromEntries(habilitacionesCentral.map((h) => [h.articuloId, h]));

  // Sin ArticuloDeposito en el central (nunca se habilitó ahí) cuenta
  // como 0 de stock disponible, no como un error aparte.
  const faltantes = requerimiento.detalle.filter((linea) => {
    const habilitacion = porArticulo[linea.articuloId];
    const disponible = habilitacion?.stock ? Number(habilitacion.stock.stockActual) : 0;
    return disponible < Number(linea.cantidadSolicitada);
  });

  if (faltantes.length > 0) {
    await marcarPendienteDeStockYReponer(tx, requerimiento, faltantes, "Sin stock suficiente en el central");
    return;
  }

  // Alcanza el stock según la lectura de arriba: reserva atómica (punto 6
  // — se descuenta acá, al aprobar, no al despachar físicamente) línea
  // por línea, con el mismo patrón atómico de registrarTransferencia
  // (movimientos-stock): el chequeo de stock va en el WHERE. Si alguna
  // línea falla igual (alguien más se llevó el stock justo entre la
  // lectura de arriba y este momento — una carrera real aunque rara), se
  // revierte lo ya descontado EN ESTE INTENTO y se trata como si hubiera
  // faltado stock desde el principio, en vez de tirar un error que
  // aborte la transacción entera del que llamó (crearRequerimiento, o la
  // recepción de una OC no relacionada vía reintentarTransferenciasPendientes).
  const decrementos = [];
  let carrera = false;
  for (const linea of requerimiento.detalle) {
    const habilitacion = porArticulo[linea.articuloId];
    const cantidad = Number(linea.cantidadSolicitada);
    const resultado = await tx.articuloDepositoStock.updateMany({
      where: { articuloDepositoId: habilitacion.id, stockActual: { gte: cantidad } },
      data: { stockActual: { decrement: cantidad } },
    });
    if (resultado.count === 0) {
      carrera = true;
      break;
    }
    decrementos.push({ articuloDepositoId: habilitacion.id, cantidad });
  }

  if (carrera) {
    for (const d of decrementos) {
      await tx.articuloDepositoStock.update({
        where: { articuloDepositoId: d.articuloDepositoId },
        data: { stockActual: { increment: d.cantidad } },
      });
    }
    await marcarPendienteDeStockYReponer(
      tx,
      requerimiento,
      requerimiento.detalle,
      "El stock del central cambió justo al confirmar la reserva"
    );
    return;
  }

  const tipoMov = await tx.tipoMovimientoStock.findFirst({
    where: { tipo: "S", contexto: "TRANSFERENCIA", activo: true },
  });
  if (!tipoMov) {
    throw new ErrorDeNegocio(
      "No hay un tipo de movimiento de Salida activo con contexto TRANSFERENCIA; correr seed-tipos-movimiento.js.",
      500
    );
  }

  // Mismo movimiento "En tránsito" que ya usa la transferencia manual
  // (HU-14), para que la recepción en destino (HU-17, confirmarRecepcion)
  // funcione sin ningún camino nuevo.
  const movimiento = await tx.movimientoStock.create({
    data: {
      depositoId: requerimiento.depositoCentralId,
      depositoDestinoId: requerimiento.depositoId,
      tipoMovStockId: tipoMov.id,
      detalle: `Transferencia por REQ-${String(requerimiento.id).padStart(4, "0")}`,
      usuario: "sistema",
      estado: "En tránsito",
    },
  });

  for (const linea of requerimiento.detalle) {
    await tx.movimientoStockDetalle.create({
      data: { movStockId: movimiento.id, articuloId: linea.articuloId, cantidad: Number(linea.cantidadSolicitada) },
    });
    // Punto 4: la reserva es, con la manual y la salida, una de las tres
    // formas en que el central pierde stock propio — tiene que poder
    // disparar su propia reposición igual que las otras dos.
    await verificarStockMinimoCentral(tx, porArticulo[linea.articuloId].id);
  }

  await tx.requerimientoReposicion.update({
    where: { id: requerimiento.id },
    data: { estado: ESTADOS_REQUERIMIENTO.EN_TRANSITO, movimientoStockId: movimiento.id },
  });
  await tx.requerimientoLog.create({
    data: {
      requerimientoId: requerimiento.id,
      usuario: "sistema",
      accion: `Transferencia aprobada y reservada — movimiento #${movimiento.id} en tránsito`,
    },
  });
}

// Deja la transferencia en "Pendiente de stock" y dispara (o acumula
// sobre) la reposición del central por las líneas que faltaron,
// consolidando TODAS en una sola solicitud de compra cuando hace falta
// crear una nueva (una transferencia bloqueada por varios artículos
// distintos no debería fragmentarse en varias compras sueltas). Si esta
// transferencia ya tiene una compra vinculada (`requerimientoCompraId`)
// no se pide de nuevo: ya se pidió la primera vez que quedó "Pendiente de
// stock", y volver a sumar cantidad en cada reintento fallido inflaría el
// pedido sin que haya una necesidad nueva real.
async function marcarPendienteDeStockYReponer(tx, requerimiento, faltantes, motivo) {
  await tx.requerimientoReposicion.update({
    where: { id: requerimiento.id },
    data: { estado: ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK },
  });
  await tx.requerimientoLog.create({
    data: {
      requerimientoId: requerimiento.id,
      usuario: "sistema",
      accion: truncarAccion(
        `${motivo} para el/los artículo(s) ${faltantes.map((f) => f.articuloId).join(", ")} — queda pendiente de stock`
      ),
    },
  });

  if (requerimiento.requerimientoCompraId) return;

  let compraId = null;
  for (const linea of faltantes) {
    compraId = await crearOSugerirReposicionCentral(tx, {
      articuloId: linea.articuloId,
      cantidad: Number(linea.cantidadSolicitada),
      depositoCentralId: requerimiento.depositoCentralId,
      origen: ORIGENES_REQUERIMIENTO.TRANSFERENCIA_BLOQUEADA,
      urgente: requerimiento.urgente,
      preferirCompraId: compraId,
    });
  }
  if (compraId) {
    // Trazabilidad (punto 8): la transferencia bloqueada queda linkeada a
    // la (única) compra que la va a destrabar.
    await tx.requerimientoReposicion.update({
      where: { id: requerimiento.id },
      data: { requerimientoCompraId: compraId },
    });
  }
}

// Reintenta un lote YA RESUELTO de transferencias "Pendiente de stock", una
// por una, cada una en su PROPIA transacción corta — a propósito NO recibe
// un `tx` de afuera. Antes esto corría dentro de la misma transacción
// atómica de registrarRecepcion (ordenesCompra.servicio.js): con la base
// remota compartida por el equipo acumulando transferencias de prueba, la
// cantidad de reintentos escalaba y la recepción entera superaba su timeout
// de 30s. Ahora cada transferencia abre/cierra su propia conexión corta
// (mismo patrón que barrerStockMinimoCentral más abajo), así que el costo ya
// no se acumula sobre la transacción de quien dispara el reintento.
// Reusado por reintentarTransferenciasPendientes (evento puntual) y por
// barrerTransferenciasPendientes (red de seguridad periódica) — ver la nota
// de riesgo residual en dispararReintentoTransferenciasPendientes
// (ordenesCompra.servicio.js) para el porqué de este desacople.
async function reintentarLotePendientes(pendientes) {
  for (const pendiente of pendientes) {
    try {
      await prisma.$transaction(
        (tx) =>
          intentarAprobarTransferencia(tx, {
            id: pendiente.id,
            depositoId: pendiente.depositoId,
            depositoCentralId: pendiente.depositoCentralId,
            urgente: pendiente.urgente,
            requerimientoCompraId: pendiente.requerimientoCompraId,
            detalle: pendiente.detalle.map((d) => ({ articuloId: d.articuloId, cantidadSolicitada: d.cantidadSolicitada })),
          }),
        OPCIONES_TRANSACCION
      );
    } catch (err) {
      // Un problema reintentando ESTA transferencia puntual (p.ej. falta la
      // semilla de tipos de movimiento) no puede tirar abajo el resto de la
      // cola — queda registrado en su propio log (fuera de la transacción
      // que acaba de fallar/revertirse) y se sigue con las demás.
      try {
        await prisma.requerimientoLog.create({
          data: {
            requerimientoId: pendiente.id,
            usuario: "sistema",
            accion: truncarAccion(`No se pudo reintentar la transferencia: ${err.message}`),
          },
        });
      } catch (logErr) {
        console.error(`[reintentarLotePendientes] no se pudo loggear el fallo de REQ-${pendiente.id}:`, logErr.message);
      }
    }
  }
}

// Sprint 3 — Fase 4 (cierre del circuito, punto 3 y 9): cuando el central
// recibe mercadería de una compra, esta función busca las transferencias
// que se habían quedado "Pendiente de stock" esperando justo ese artículo
// y reintenta aprobarlas — por orden de urgente primero y después por
// antigüedad (FIFO), para que la reposición se reparta en el orden en que
// se pidió, no en el orden en que a cada una le toque reintentarse sola.
async function reintentarTransferenciasPendientes({ depositoCentralId, articuloId }) {
  const pendientes = await prisma.requerimientoReposicion.findMany({
    where: {
      tipo: TIPOS_REQUERIMIENTO.TRANSFERENCIA,
      estado: ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK,
      depositoCentralId,
      anulado: false,
      detalle: { some: { articuloId } },
    },
    include: { detalle: true },
    orderBy: [{ urgente: "desc" }, { fecha: "asc" }],
  });

  await reintentarLotePendientes(pendientes);
}

// Red de seguridad (ver riesgo residual documentado en
// dispararReintentoTransferenciasPendientes, ordenesCompra.servicio.js):
// barre TODAS las transferencias "Pendiente de stock" de cualquier central
// activo, no solo las de un artículo puntual. Cubre el caso en que el
// proceso se cayó justo entre el commit de una recepción y el reintento por
// evento — sin esto, esa transferencia quedaría pendiente para siempre en
// vez de hasta la próxima corrida de este barrido. Se llama junto con
// barrerStockMinimoCentral desde jobsStockMinimo.js.
async function barrerTransferenciasPendientes() {
  const pendientes = await prisma.requerimientoReposicion.findMany({
    where: {
      tipo: TIPOS_REQUERIMIENTO.TRANSFERENCIA,
      estado: ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK,
      anulado: false,
      depositoCentral: { activo: true },
    },
    include: { detalle: true },
    orderBy: [{ urgente: "desc" }, { fecha: "asc" }],
  });

  await reintentarLotePendientes(pendientes);
  return { revisadas: pendientes.length };
}

// Sprint 3 — genera (o acumula sobre) la solicitud de reposición del
// central para UN artículo, y devuelve su id. Dedupea contra una
// solicitud COMPRA ya abierta para ese mismo artículo+central
// (Sugerida/Pendiente/En cotización): evita que cinco depósitos pidiendo
// lo mismo el mismo día generen cinco sugerencias sueltas — se van
// sumando a la misma.
//
// `preferirCompraId` (opcional): cuando el llamador ya generó/encontró
// una compra para OTRO artículo de la misma transferencia en esta misma
// pasada, la pasa acá para que ese segundo artículo se sume a esa MISMA
// compra en vez de crear una nueva — así una transferencia bloqueada por
// varios artículos termina en una sola solicitud de reposición, no una
// por artículo.
//
// El `findFirst` de acá abajo es un check-then-act sin lock: dos disparos
// concurrentes sobre el mismo artículo+central podrían, en teoría, crear
// dos solicitudes en vez de una. Se serializa con un FOR UPDATE sobre la
// fila del artículo (mismo patrón que el FOR UPDATE de OrdenCompra en
// ordenesCompra.servicio.js) para que la segunda transacción concurrente
// espere a que la primera termine de decidir antes de mirar ella misma.
async function crearOSugerirReposicionCentral(
  tx,
  { articuloId, cantidad, depositoCentralId, origen, urgente, preferirCompraId }
) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM articulos WHERE id = ${articuloId} FOR UPDATE`);

  let abierta = null;
  if (preferirCompraId) {
    abierta = await tx.requerimientoReposicion.findUnique({
      where: { id: preferirCompraId },
      include: { detalle: true },
    });
  }
  if (!abierta) {
    abierta = await tx.requerimientoReposicion.findFirst({
      where: {
        tipo: TIPOS_REQUERIMIENTO.COMPRA,
        depositoId: depositoCentralId,
        anulado: false,
        estado: {
          in: [ESTADOS_REQUERIMIENTO.SUGERIDA, ESTADOS_REQUERIMIENTO.PENDIENTE, ESTADOS_REQUERIMIENTO.EN_COTIZACION],
        },
        detalle: { some: { articuloId } },
      },
      include: { detalle: true },
    });
  }

  if (abierta) {
    const linea = abierta.detalle.find((d) => d.articuloId === articuloId);
    if (linea) {
      await tx.requerimientoDetalle.update({
        where: { id: linea.id },
        data: { cantidadSolicitada: { increment: cantidad } },
      });
    } else {
      // Vino de `preferirCompraId`: esta compra existe (para otro
      // artículo de la misma transferencia) pero todavía no tiene línea
      // para este artículo puntual.
      await tx.requerimientoDetalle.create({
        data: { requerimientoId: abierta.id, articuloId, cantidadSolicitada: cantidad },
      });
    }
    if (urgente && !abierta.urgente) {
      await tx.requerimientoReposicion.update({ where: { id: abierta.id }, data: { urgente: true } });
    }
    await tx.requerimientoLog.create({
      data: {
        requerimientoId: abierta.id,
        usuario: "sistema",
        accion: `Se suma ${cantidad} al pedido de reposición ya abierto (artículo ${articuloId}, origen ${origen})`,
      },
    });
    return abierta.id;
  }

  const articulo = await tx.articulo.findUnique({ where: { id: articuloId } });
  const estadoInicial =
    articulo.modoReposicion === "AUTOMATICA" ? ESTADOS_REQUERIMIENTO.PENDIENTE : ESTADOS_REQUERIMIENTO.SUGERIDA;
  const creado = await tx.requerimientoReposicion.create({
    data: {
      depositoId: depositoCentralId,
      origen,
      tipo: TIPOS_REQUERIMIENTO.COMPRA,
      urgente: Boolean(urgente),
      estado: estadoInicial,
      nacioComoSugerida: estadoInicial === ESTADOS_REQUERIMIENTO.SUGERIDA,
      solicitante: "sistema",
    },
  });
  await tx.requerimientoDetalle.create({
    data: { requerimientoId: creado.id, articuloId, cantidadSolicitada: cantidad },
  });
  await tx.requerimientoLog.create({
    data: {
      requerimientoId: creado.id,
      usuario: "sistema",
      accion: `Solicitud de reposición generada — ${estadoInicial} (origen ${origen})`,
    },
  });
  return creado.id;
}

// Una reposición por punto de reorden (origen ALERTA) no es urgente por
// default — es preventiva, todavía hay margen. Pero si el central ya está
// en (o por debajo de) este % de su mínimo, el riesgo de que la PRÓXIMA
// transferencia que le pida un periférico se quede sin stock (Pendiente de
// stock) es alto, así que esa solicitud puntual sí nace urgente=true —
// mismo criterio que ya prioriza en el picking del central, ahora también
// dispara antes.
const PORCENTAJE_STOCK_CRITICO = 0.10;

// Sprint 3 — punto 4: reposición automática por stock mínimo. Se llama
// después de cada decremento de stock sobre CUALQUIER depósito (el
// llamador no necesita saber de antemano si es central); acá se decide
// si corresponde hacer algo. `articuloDepositoId` es el id de la fila
// ArticuloDeposito (no el articuloId ni el depositoId sueltos).
async function verificarStockMinimoCentral(tx, articuloDepositoId) {
  const habilitacion = await tx.articuloDeposito.findUnique({
    where: { id: articuloDepositoId },
    include: { deposito: true, stock: true },
  });
  if (!habilitacion || !habilitacion.deposito.esCentral || !habilitacion.stock) return;

  const stockActual = Number(habilitacion.stock.stockActual);
  const stockMinimo = Number(habilitacion.stock.stockMinimo);
  if (stockActual >= stockMinimo) return;

  // Mismo criterio que la sugerencia de HU-8 (frontend/src/lib/alertas.js):
  // reponer hasta el máximo si está definido; si no, alcanza con volver
  // a tocar el mínimo.
  const objetivo = habilitacion.stock.stockMaximo != null ? Number(habilitacion.stock.stockMaximo) : stockMinimo;
  const cantidad = Math.max(0, objetivo - stockActual);
  if (cantidad <= 0) return;

  const urgente = stockMinimo > 0 && stockActual <= stockMinimo * PORCENTAJE_STOCK_CRITICO;

  await crearOSugerirReposicionCentral(tx, {
    articuloId: habilitacion.articuloId,
    cantidad,
    depositoCentralId: habilitacion.depositoId,
    origen: ORIGENES_REQUERIMIENTO.ALERTA,
    urgente,
  });
}

// Red de seguridad además del trigger por evento de arriba: ese solo mira
// el artículo que ACABA de perder stock en el mismo movimiento, así que un
// artículo que ya nace por debajo del mínimo sin que medie un movimiento
// posterior (carga inicial de datos, o alguien bajando el stockMinimo por
// ABM) se queda crítico en silencio para siempre — nunca hay un evento que
// dispare la verificación. Pensado para correr periódicamente (ver
// lib/jobsStockMinimo.js), recorriendo TODAS las habilitaciones de un
// central en vez de esperar a que algo las toque.
//
// Reusa verificarStockMinimoCentral artículo por artículo (mismo motor,
// mismo dedupe contra una solicitud ya abierta, mismo respeto de
// modoReposicion) en vez de reimplementar la lógica acá — esto complementa
// al trigger por evento, no lo reemplaza. Cada artículo va en su propia
// transacción corta: un artículo con datos raros no puede tirar abajo el
// barrido completo, y no tiene sentido tener el pool de 3 conexiones de la
// base remota ocupado por una sola transacción gigante.
async function barrerStockMinimoCentral() {
  const candidatos = await prisma.articuloDeposito.findMany({
    where: { activo: true, deposito: { esCentral: true, activo: true }, stock: { isNot: null } },
    select: { id: true },
  });

  let fallidos = 0;
  for (const { id: articuloDepositoId } of candidatos) {
    try {
      await prisma.$transaction(
        (tx) => verificarStockMinimoCentral(tx, articuloDepositoId),
        OPCIONES_TRANSACCION
      );
    } catch (err) {
      fallidos += 1;
      console.error(`[barrerStockMinimoCentral] articuloDepositoId=${articuloDepositoId}:`, err.message);
    }
  }
  return { revisados: candidatos.length, conError: fallidos };
}

// Filtro compartido de búsqueda/depósito/tipo — sin estado/categoría ni
// incluirAnulados, porque listarRequerimientos y obtenerResumenRequerimientos
// necesitan la MISMA base (mismos filtros activos) pero cada uno decide su
// propia parte de estado/anulado por separado.
function construirWhereBase({ depositoId, tipo, q }) {
  const texto = (q ?? "").trim();
  // El buscador acepta el número de requerimiento (con o sin el prefijo
  // "REQ-" y los ceros a la izquierda), el depósito o el solicitante —
  // mismo criterio flexible que el buscador de Proveedores (razón social
  // o CUIT en un solo campo).
  const idBuscado = Number(texto.replace(/^req-?0*/i, ""));

  return {
    ...(depositoId ? { depositoId: Number(depositoId) } : {}),
    ...(tipo ? { tipo } : {}),
    ...(texto
      ? {
          OR: [
            ...(Number.isInteger(idBuscado) && idBuscado > 0 ? [{ id: idBuscado }] : []),
            { solicitante: { contains: texto } },
            { deposito: { nombre: { contains: texto } } },
          ],
        }
      : {}),
  };
}

// Estados de OC que cuentan como "ya recibida" para el paso 4 (Recepción)
// del mini-stepper de una COMPRA — mismos valores que usa
// ordenesCompra.servicio.js al fijar `estadoFinalOC`.
const ESTADOS_OC_RECIBIDA = ["Recibida", "Recibida con diferencia", "Cerrada"];

async function listarRequerimientos({
  estado,
  categoria,
  depositoId,
  tipo,
  q,
  urgente,
  soloAbiertas,
  incluirAnulados = false,
  page = 1,
  pageSize = 10,
} = {}) {
  const where = {
    ...construirWhereBase({ depositoId, tipo, q }),
    // `estado` (valor puntual, del dropdown) y `categoria` (de las
    // tarjetas de resumen) son mutuamente excluyentes — el controlador es
    // el que decide cuál mandar según qué tocó el usuario. `soloAbiertas`
    // es lo que pide la tarjeta "Urgentes abiertas": ni completadas ni
    // canceladas, sin importar cuál en particular.
    ...(estado
      ? { estado }
      : categoria
        ? { estado: { in: estadosDeCategoria(categoria) } }
        : soloAbiertas
          ? {
              estado: {
                notIn: [
                  ...estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.COMPLETADO),
                  ...estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.CANCELADO),
                ],
              },
            }
          : {}),
    ...(urgente ? { urgente: true } : {}),
    // Por defecto, un anulado no aparece: nunca pasó de "Pendiente" (no se
    // puede anular después), así que solo afecta ese bucket. Requerimientos
    // (la pantalla de seguimiento) pide incluirAnulados=true para verlo
    // igual, con su propio badge — Presupuestos no, porque un anulado no
    // tiene nada que cotizar.
    ...(incluirAnulados ? {} : { anulado: false }),
  };

  // Trae TODO lo que matchea el filtro (sin skip/take) en vez de solo la
  // página pedida: los urgentes sin finalizar tienen que quedar fijados
  // arriba de la tabla sin importar en qué página caería su fecha, y
  // Prisma no puede expresar ese orden condicional en un `orderBy`
  // declarativo (no hay CASE WHEN) — se ordena y se pagina acá. Al mismo
  // tiempo evita la consulta de `count` aparte: con esto ya sobra
  // `items.length`, un round-trip menos contra una base con pool de 3
  // conexiones.
  const items = await prisma.requerimientoReposicion.findMany({
    where,
    include: {
      deposito: { select: { id: true, nombre: true } },
      detalle: { select: { id: true } },
      presupuestos: {
        select: {
          id: true,
          estado: true,
          fecha: true,
          _count: { select: { detalle: true } },
          ordenCompra: { select: { estado: true } },
        },
      },
    },
    orderBy: { fecha: "desc" },
  });

  // Un urgente se fija arriba mientras siga "abierto" — deja de estarlo en
  // cuanto termina su circuito (Completado/Cancelado) o se anula, mismo
  // criterio que ya usa la tarjeta "Urgentes abiertas" del resumen.
  const estadosFinalizados = [
    ...estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.COMPLETADO),
    ...estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.CANCELADO),
  ];
  const esUrgenteAbierto = (r) => r.urgente && !r.anulado && !estadosFinalizados.includes(r.estado);
  // Array.prototype.sort de Node es estable: dentro de cada grupo de
  // prioridad se conserva el orden por fecha desc que ya trajo la query.
  items.sort((a, b) => Number(esUrgenteAbierto(b)) - Number(esUrgenteAbierto(a)));

  const total = items.length;
  const pagina = items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  // La pantalla necesita "cuántos artículos", "cuántos presupuestos ya
  // cotizaron" y "ya llegó la compra" sin traerse el detalle entero de cada
  // uno. "Cotizó de verdad" sale de si mandó precios (_count.detalle > 0),
  // no del estado — aprobarPresupuesto pone en "Rechazado" a TODOS los no
  // ganadores al adjudicar, incluidos los que se quedaron en "Solicitado"
  // sin responder nunca. Mismo criterio que listarPresupuestos en
  // presupuestos.servicio.js. "ocRecibida" es el paso 4 del mini-stepper de
  // una COMPRA: el presupuesto adjudicado tiene una OC ya recibida.
  const conResumen = pagina.map(({ detalle, presupuestos, ...r }) => ({
    ...r,
    cantidadArticulos: detalle.length,
    cantidadPresupuestos: presupuestos.length,
    presupuestosCotizados: presupuestos.filter((p) => p._count.detalle > 0).length,
    ocRecibida: presupuestos.some(
      (p) => p.estado === "Adjudicado" && p.ordenCompra && ESTADOS_OC_RECIBIDA.includes(p.ordenCompra.estado)
    ),
    // Pantalla de Presupuestos: "hace cuánto espera respuesta de
    // cotización" se cuenta desde que se invitó a los proveedores (todos
    // los invitados de una misma solicitud se crean juntos, en la misma
    // transacción — la fecha más vieja entre ellos alcanza), no desde que
    // se creó el requerimiento. `null` mientras no se solicitó nada
    // todavía (el frontend usa `fecha` en ese caso).
    fechaSolicitudCotizacion:
      presupuestos.length > 0
        ? presupuestos.reduce((min, p) => (p.fecha < min ? p.fecha : min), presupuestos[0].fecha)
        : null,
  }));

  return { items: conResumen, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// Rediseño de la pantalla — los 4 contadores de las tarjetas de resumen.
// Respetan los mismos filtros de búsqueda/depósito/tipo que la lista, pero
// nunca el de estado/categoría: son ellos los que ofrecen filtrar por
// categoría al hacerles click.
async function obtenerResumenRequerimientos({ depositoId, tipo, q } = {}) {
  const base = { ...construirWhereBase({ depositoId, tipo, q }), anulado: false };
  const estadosTerminales = [
    ...estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.COMPLETADO),
    ...estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.CANCELADO),
  ];

  // Secuencial, no Promise.all — mismo motivo que en listarRequerimientos:
  // la base remota tiene un pool de solo 3 conexiones.
  const necesitaAccion = await prisma.requerimientoReposicion.count({
    where: { ...base, estado: { in: estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION) } },
  });
  const enCurso = await prisma.requerimientoReposicion.count({
    where: { ...base, estado: { in: estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.EN_CURSO) } },
  });
  const completadas = await prisma.requerimientoReposicion.count({
    where: { ...base, estado: { in: estadosDeCategoria(CATEGORIAS_REQUERIMIENTO.COMPLETADO) } },
  });
  const urgentesAbiertas = await prisma.requerimientoReposicion.count({
    where: { ...base, urgente: true, estado: { notIn: estadosTerminales } },
  });

  return { necesitaAccion, enCurso, completadas, urgentesAbiertas };
}

// HU-81 — editar un requerimiento. Solo mientras está "Pendiente": una vez
// que se pidieron presupuestos, los proveedores ya están cotizando sobre
// lo que se les mandó — cambiarlo ahí invalidaría esa cotización sin que
// nadie se entere. Mismo principio que "se copian, no se editan" en
// OrdenCompra. Reemplaza el detalle entero (borra y vuelve a crear las
// líneas) en vez de hacer un diff línea por línea: más simple y el
// detalle de un requerimiento en Pendiente no tiene ninguna otra tabla
// que dependa de una línea puntual.
async function actualizarRequerimiento(id, { depositoId, detalle }) {
  const existente = await prisma.requerimientoReposicion.findUnique({ where: { id } });
  if (!existente) throw new ErrorDeNegocio("El requerimiento no existe", 404);
  if (existente.anulado) throw new ErrorDeNegocio("Este requerimiento está anulado.", 409);
  if (existente.estado !== ESTADOS_REQUERIMIENTO.PENDIENTE) {
    throw new ErrorDeNegocio('Solo se puede editar un requerimiento en estado "Pendiente".', 409);
  }

  const deposito = await prisma.deposito.findUnique({ where: { id: depositoId } });
  if (!deposito) throw new ErrorDeNegocio("El depósito indicado no existe", 404);
  if (!deposito.activo) throw new ErrorDeNegocio("El depósito está dado de baja", 400);

  const ids = detalle.map((d) => d.articuloId);
  if (new Set(ids).size !== ids.length) {
    throw new ErrorDeNegocio("Hay artículos repetidos en el detalle: cargá una sola línea por artículo", 400);
  }
  const articulos = await prisma.articulo.findMany({ where: { id: { in: ids } } });
  if (articulos.length !== ids.length) {
    throw new ErrorDeNegocio("Alguno de los artículos indicados no existe", 404);
  }
  const inactivo = articulos.find((a) => !a.activo);
  if (inactivo) {
    throw new ErrorDeNegocio(`El artículo "${inactivo.nombre}" está dado de baja y no puede pedirse`, 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.requerimientoReposicion.update({ where: { id }, data: { depositoId } });
    await tx.requerimientoDetalle.deleteMany({ where: { requerimientoId: id } });
    await tx.requerimientoDetalle.createMany({
      data: detalle.map((d) => ({
        requerimientoId: id,
        articuloId: d.articuloId,
        cantidadSolicitada: d.cantidadSolicitada,
      })),
    });
  }, OPCIONES_TRANSACCION);

  return obtenerRequerimientoPorId(id);
}

// HU-81 — anular. Baja lógica, nunca un DELETE (mismo criterio que
// OrdenCompra.anularOC): igual que editar, solo mientras está "Pendiente",
// porque anular después de invitar proveedores a cotizar los deja
// respondiendo a un pedido que ya no existe.
async function anularRequerimiento(id, motivo) {
  const existente = await prisma.requerimientoReposicion.findUnique({ where: { id } });
  if (!existente) throw new ErrorDeNegocio("El requerimiento no existe", 404);
  if (existente.anulado) throw new ErrorDeNegocio("Este requerimiento ya está anulado.", 409);
  // "Sugerida" se admite acá también (Sprint 3): descartar una sugerencia
  // de reposición es, en la práctica, la misma baja lógica que anular un
  // pedido manual — nunca se pidió nada a nadie todavía.
  if (![ESTADOS_REQUERIMIENTO.PENDIENTE, ESTADOS_REQUERIMIENTO.SUGERIDA].includes(existente.estado)) {
    throw new ErrorDeNegocio(
      'Solo se puede anular un requerimiento en estado "Pendiente" o "Sugerida" — una vez que se pidieron presupuestos, ya compromete a los proveedores invitados.',
      409
    );
  }
  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.requerimientoReposicion.update({
      where: { id },
      data: { anulado: true, motivoAnulacion: motivo },
      include: INCLUDE_DETALLE,
    });
    await tx.requerimientoLog.create({
      data: { requerimientoId: id, usuario: "sistema", accion: `Anulada: ${motivo}` },
    });

    // Sprint 3: si esto era una reposición del central (tipo COMPRA) de la
    // que dependían transferencias bloqueadas, liberarlas — si no, el
    // guard de marcarPendienteDeStockYReponer las deja varadas para
    // siempre en "Pendiente de stock" porque ya "tienen" una compra
    // vinculada, aunque esa compra acabe de anularse.
    if (actualizado.tipo === TIPOS_REQUERIMIENTO.COMPRA) {
      const liberadas = await tx.requerimientoReposicion.findMany({
        where: { requerimientoCompraId: id },
        select: { id: true },
      });
      if (liberadas.length > 0) {
        await tx.requerimientoReposicion.updateMany({
          where: { requerimientoCompraId: id },
          data: { requerimientoCompraId: null },
        });
        for (const { id: transferenciaId } of liberadas) {
          await tx.requerimientoLog.create({
            data: {
              requerimientoId: transferenciaId,
              usuario: "sistema",
              accion: `La compra de reposición vinculada (REQ-${String(id).padStart(4, "0")}) fue anulada — se libera para poder pedir reposición de nuevo`,
            },
          });
        }
      }
    }

    return actualizado;
  }, OPCIONES_TRANSACCION);
}


// Sprint 3 — confirma una reposición del central que había quedado
// "Sugerida" (Articulo.modoReposicion = SUGERIDA). A partir de acá sigue
// el mismo camino que cualquier requerimiento COMPRA en "Pendiente".
async function confirmarSugerencia(id, usuario) {
  const existente = await prisma.requerimientoReposicion.findUnique({ where: { id } });
  if (!existente) throw new ErrorDeNegocio("El requerimiento no existe", 404);
  // anularRequerimiento (reusado como "Descartar" sugerencias) marca
  // anulado=true pero deja el estado en "Sugerida" — sin este chequeo,
  // una sugerencia descartada se podía confirmar igual.
  if (existente.anulado) throw new ErrorDeNegocio("Esta sugerencia fue descartada.", 409);
  if (existente.estado !== ESTADOS_REQUERIMIENTO.SUGERIDA) {
    throw new ErrorDeNegocio(
      `Solo se puede confirmar un requerimiento en estado "${ESTADOS_REQUERIMIENTO.SUGERIDA}" (este está en "${existente.estado}")`,
      409
    );
  }
  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.requerimientoReposicion.update({
      where: { id },
      data: { estado: ESTADOS_REQUERIMIENTO.PENDIENTE },
      include: INCLUDE_DETALLE,
    });
    await tx.requerimientoLog.create({
      data: { requerimientoId: id, usuario: usuario || "sistema", accion: "Sugerencia de reposición confirmada" },
    });
    return actualizado;
  }, OPCIONES_TRANSACCION);
}

// Ficha completa: incluye los presupuestos asociados para que la pantalla
// de detalle no tenga que pedirlos en una segunda llamada.
async function obtenerRequerimientoPorId(id) {
  return prisma.requerimientoReposicion.findUnique({
    where: { id },
    include: {
      ...INCLUDE_DETALLE,
      presupuestos: {
        // El archivo adjunto (punto 9 de Presupuestos) es un BLOB de hasta
        // 5MB — nunca debe viajar en la ficha del requerimiento, solo en
        // el endpoint dedicado a descargarlo (ver presupuestos.servicio.js).
        omit: { archivoAdjunto: true },
        include: {
          proveedor: { select: { id: true, razonSocial: true, cuit: true } },
          detalle: true,
        },
        orderBy: { id: "asc" },
      },
      // Cuando esta TRANSFERENCIA quedó "Pendiente de stock", esta es la
      // reposición del central (tipo COMPRA) que se generó sola para
      // destrabarla — la ficha necesita mostrar su número y estado.
      requerimientoCompra: { select: { id: true, estado: true } },
      log: { orderBy: { fecha: "asc" } },
    },
  });
}

module.exports = {
  ErrorDeNegocio,
  ESTADOS_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  TIPOS_REQUERIMIENTO,
  crearRequerimiento,
  listarRequerimientos,
  obtenerResumenRequerimientos,
  obtenerRequerimientoPorId,
  actualizarRequerimiento,
  anularRequerimiento,
  confirmarSugerencia,
  verificarStockMinimoCentral,
  barrerStockMinimoCentral,
  barrerTransferenciasPendientes,
  intentarAprobarTransferencia,
  reintentarTransferenciasPendientes,
};
