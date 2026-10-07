const { OPCIONES_TRANSACCION } = require('../../lib/constantes');
// src/modulos/movimientos-stock/movimientosStock.servicio.js
//
// Lógica de negocio pura (HU-12: Movimiento de Entrada). No sabe nada de
// HTTP/Express — recibe datos, devuelve datos o tira errores con un
// "statusCode" para que el controlador decida cómo responder.
//
// Reutilizable: mañana se puede llamar desde un script de carga masiva
// sin pasar por una request HTTP, algo que con todo mezclado en la ruta
// no se podía hacer.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { verificarStockMinimoCentral, verificarStockMinimoCentralEnLote, crearRequerimiento } = require("../requerimientos/requerimientos.servicio");
const { incrementarStockEnLote, descontarStockEnLote } = require("../../lib/stockLote");
const { ESTADOS_REQUERIMIENTO, TIPOS_REQUERIMIENTO, MOTIVOS_RESOLUCION_DIFERENCIA } = require("../../lib/constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

async function registrarEntrada({ depositoId, tipoMovStockId, detalle, usuario, items }) {
  // --- Validaciones básicas de payload ---
  if (!depositoId || !tipoMovStockId) {
    throw new ErrorDeNegocio("depositoId y tipoMovStockId son obligatorios.");
  }
  // El front exige "de donde viene" (proveedor, area, ajuste) antes de dejar
  // confirmar, pero no hay columna dedicada para esa contraparte externa —
  // viaja plegada en "detalle". Sin este chequeo, la API aceptaba una
  // Entrada sin ningun dato de origen si se llamaba directo (sin pasar por
  // el formulario), lo que contradice la propia HU-12 ("trazabilidad de
  // cuando, cuanto y por que").
  if (!detalle || !String(detalle).trim()) {
    throw new ErrorDeNegocio("detalle es obligatorio: debe indicar el origen del movimiento (proveedor, área, motivo).");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorDeNegocio("Debe incluir al menos un artículo en 'items'.");
  }
  const articuloIds = items.map((i) => i.articuloId);
  if (new Set(articuloIds).size !== articuloIds.length) {
    throw new ErrorDeNegocio("No se puede repetir el mismo artículo dos veces en el detalle.");
  }
  if (items.some((i) => !i.articuloId || !(Number(i.cantidad) > 0))) {
    throw new ErrorDeNegocio("Cada ítem necesita articuloId y una cantidad mayor a 0.");
  }

  // --- Validar tipo de movimiento (debe ser de Entrada) ---
  const tipoMov = await prisma.tipoMovimientoStock.findUnique({ where: { id: Number(tipoMovStockId) } });
  if (!tipoMov || !tipoMov.activo) {
    throw new ErrorDeNegocio("El tipo de movimiento indicado no existe o está inactivo.");
  }
  if (tipoMov.tipo !== "E") {
    throw new ErrorDeNegocio(`El tipo de movimiento '${tipoMov.descripcion}' no es de Entrada (tipo='E').`);
  }
  if (tipoMov.contexto !== "NORMAL") {
    throw new ErrorDeNegocio(
      `El tipo de movimiento '${tipoMov.descripcion}' es exclusivo del flujo de Transferencia y no se puede elegir a mano.`
    );
  }

  // --- Validar depósito ---
  const deposito = await prisma.deposito.findUnique({ where: { id: Number(depositoId) } });
  if (!deposito || !deposito.activo) {
    throw new ErrorDeNegocio("El depósito indicado no existe o está inactivo.");
  }

  // --- Validar habilitación Artículo-Depósito (HU-4) ---
  const habilitaciones = await prisma.articuloDeposito.findMany({
    where: { depositoId: Number(depositoId), articuloId: { in: articuloIds }, activo: true },
    include: { articulo: true },
  });
  const habilitadosIds = new Set(habilitaciones.map((h) => h.articuloId));
  const noHabilitados = articuloIds.filter((id) => !habilitadosIds.has(id));
  if (noHabilitados.length > 0) {
    throw new ErrorDeNegocio(
      `Los artículos [${noHabilitados.join(", ")}] no están habilitados en este depósito (HU-4).`
    );
  }

  // --- Validar que ningun articulo este dado de baja (HU-2) ---
  const deshabilitados = habilitaciones.filter((h) => !h.articulo.activo);
  if (deshabilitados.length > 0) {
    const nombres = deshabilitados.map((h) => h.articulo.nombre).join(", ");
    throw new ErrorDeNegocio(`Los siguientes artículos están dados de baja y no aceptan movimientos: ${nombres}.`);
  }

  const habilitacionPorArticulo = Object.fromEntries(habilitaciones.map((h) => [h.articuloId, h]));

  // --- Transacción atómica: alta del movimiento + detalle + stock ---
  const movimientoCreado = await prisma.$transaction(
    async (tx) => {
      const movimiento = await tx.movimientoStock.create({
        data: {
          depositoId: Number(depositoId),
          tipoMovStockId: Number(tipoMovStockId),
          detalle: detalle || null,
          usuario: usuario || null,
        },
      });

      // Una sola sentencia para todo el detalle y otra para todo el stock: la cantidad de consultas dentro de la
      // transacción no crece con la cantidad de artículos (con la base remota, 2 por ítem pasaba los 15 s con 20 ítems).
      await tx.movimientoStockDetalle.createMany({
        data: items.map((item) => ({ movStockId: movimiento.id, articuloId: item.articuloId, cantidad: Number(item.cantidad) })),
      });
      await incrementarStockEnLote(
        tx,
        items.map((item) => ({ articuloDepositoId: habilitacionPorArticulo[item.articuloId].id, cantidad: Number(item.cantidad) })),
      );

      return tx.movimientoStock.findUnique({
        where: { id: movimiento.id },
        include: {
          deposito: true,
          tipoMovStock: true,
          detalleMovimientos: { include: { articulo: true } },
        },
      });
    },
    OPCIONES_TRANSACCION
  );

  return movimientoCreado;
}

// HU-9, 14 a 17: listado generico de movimientos, usado por la pantalla de
// Movimientos registrados, Kardex, Recepciones, Dashboard y Reporte de
// Consumo — todas leen de aca y agregan del lado del cliente, en vez de
// duplicar consultas parecidas en el backend.
async function listarMovimientos({ depositoId, destinoId, articuloId, estado, tipo, desde, hasta } = {}) {
  const where = {};
  if (depositoId) where.depositoId = Number(depositoId);
  if (destinoId) where.depositoDestinoId = Number(destinoId);
  if (estado) where.estado = String(estado);
  if (tipo) where.tipoMovStock = { tipo: String(tipo) };
  if (articuloId) where.detalleMovimientos = { some: { articuloId: Number(articuloId) } };
  if (desde || hasta) {
    where.fecha = {};
    // new Date("YYYY-MM-DD") ya cae en medianoche UTC. Para "hasta" usamos
    // "menor al dia siguiente" (limite exclusivo) en vez de setHours(23,59,59) —
    // setHours opera en hora LOCAL del proceso, asi que sobre una fecha en UTC
    // corria el corte varias horas para atras segun el timezone del server
    // (en la practica, dejaba afuera movimientos del propio dia "hasta").
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) {
      const siguienteDia = new Date(hasta);
      siguienteDia.setUTCDate(siguienteDia.getUTCDate() + 1);
      where.fecha.lt = siguienteDia;
    }
  }

  return prisma.movimientoStock.findMany({
    where,
    include: {
      deposito: true,
      depositoDestino: true,
      tipoMovStock: true,
      detalleMovimientos: { include: { articulo: true } },
    },
    orderBy: { fecha: "desc" },
  });
}

// HU-14: primera mitad de una transferencia. Mismas validaciones que
// registrarSalida (habilitacion + stock en origen), mas habilitacion en
// destino. No crea la entrada todavia — el movimiento queda "En tránsito"
// hasta que el destino confirma con confirmarRecepcion.
async function registrarTransferencia({ depositoId, depositoDestinoId, detalle, usuario, items }) {
  if (!depositoId || !depositoDestinoId) {
    throw new ErrorDeNegocio("depositoId y depositoDestinoId son obligatorios.");
  }
  if (Number(depositoId) === Number(depositoDestinoId)) {
    throw new ErrorDeNegocio("El depósito destino no puede ser igual al de origen.");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorDeNegocio("Debe incluir al menos un artículo en 'items'.");
  }
  const articuloIds = items.map((i) => i.articuloId);
  if (new Set(articuloIds).size !== articuloIds.length) {
    throw new ErrorDeNegocio("No se puede repetir el mismo artículo dos veces en el detalle.");
  }
  if (items.some((i) => !i.articuloId || !(Number(i.cantidad) > 0))) {
    throw new ErrorDeNegocio("Cada ítem necesita articuloId y una cantidad mayor a 0.");
  }

  // El tipo de movimiento del lado salida de una transferencia no lo elige
  // el usuario: siempre es el tipo S de contexto TRANSFERENCIA sembrado por
  // seed-tipos-movimiento.js.
  const tipoMov = await prisma.tipoMovimientoStock.findFirst({
    where: { tipo: "S", contexto: "TRANSFERENCIA", activo: true },
  });
  if (!tipoMov) {
    throw new ErrorDeNegocio(
      "No hay un tipo de movimiento de Salida activo con contexto TRANSFERENCIA; correr seed-tipos-movimiento.js."
    );
  }

  const [origen, destino] = await Promise.all([
    prisma.deposito.findUnique({ where: { id: Number(depositoId) } }),
    prisma.deposito.findUnique({ where: { id: Number(depositoDestinoId) } }),
  ]);
  if (!origen || !origen.activo) {
    throw new ErrorDeNegocio("El depósito de origen no existe o está inactivo.");
  }
  if (!destino || !destino.activo) {
    throw new ErrorDeNegocio("El depósito destino no existe o está inactivo.");
  }

  const [habilitacionesOrigen, habilitacionesDestino] = await Promise.all([
    prisma.articuloDeposito.findMany({
      where: { depositoId: Number(depositoId), articuloId: { in: articuloIds }, activo: true },
      include: { articulo: true },
    }),
    prisma.articuloDeposito.findMany({
      where: { depositoId: Number(depositoDestinoId), articuloId: { in: articuloIds }, activo: true },
    }),
  ]);
  const habilitadosOrigenIds = new Set(habilitacionesOrigen.map((h) => h.articuloId));
  const noHabilitadosOrigen = articuloIds.filter((id) => !habilitadosOrigenIds.has(id));
  if (noHabilitadosOrigen.length > 0) {
    throw new ErrorDeNegocio(
      `Los artículos [${noHabilitadosOrigen.join(", ")}] no están habilitados en el depósito de origen.`
    );
  }
  const habilitadosDestinoIds = new Set(habilitacionesDestino.map((h) => h.articuloId));
  const noHabilitadosDestino = articuloIds.filter((id) => !habilitadosDestinoIds.has(id));
  if (noHabilitadosDestino.length > 0) {
    throw new ErrorDeNegocio(
      `Los artículos [${noHabilitadosDestino.join(", ")}] no están habilitados en el depósito destino.`
    );
  }

  const deshabilitados = habilitacionesOrigen.filter((h) => !h.articulo.activo);
  if (deshabilitados.length > 0) {
    const nombres = deshabilitados.map((h) => h.articulo.nombre).join(", ");
    throw new ErrorDeNegocio(`Los siguientes artículos están dados de baja y no aceptan movimientos: ${nombres}.`);
  }

  const habilitacionPorArticulo = Object.fromEntries(habilitacionesOrigen.map((h) => [h.articuloId, h]));

  const movimientoCreado = await prisma.$transaction(
    async (tx) => {
      const movimiento = await tx.movimientoStock.create({
        data: {
          depositoId: Number(depositoId),
          depositoDestinoId: Number(depositoDestinoId),
          tipoMovStockId: tipoMov.id,
          detalle: detalle || null,
          usuario: usuario || null,
          estado: "En tránsito",
        },
      });

      // Detalle y descuento en lote (una sentencia cada uno): "verificar y descontar" sigue siendo atómico (todo o
      // nada; dos transferencias/salidas simultáneas no pueden pasar ambas la validación con el mismo stock leído).
      await tx.movimientoStockDetalle.createMany({
        data: items.map((item) => ({ movStockId: movimiento.id, articuloId: item.articuloId, cantidad: Number(item.cantidad) })),
      });
      const filas = items.map((item) => ({
        articuloDepositoId: habilitacionPorArticulo[item.articuloId].id,
        articuloId: item.articuloId,
        cantidad: Number(item.cantidad),
      }));
      const sinStock = await descontarStockEnLote(tx, filas);
      if (sinStock.length > 0) {
        const f = sinStock[0];
        throw new ErrorDeNegocio(
          `Stock insuficiente para el artículo ${f.articuloId}. Actual: ${f.stockActual}, Solicitado: ${f.cantidad}.`
        );
      }

      // Sprint 3 — Transferencia a Central: una transferencia manual (HU-14) puede salir justamente DESDE un
      // central. Si lo deja bajo el mínimo, dispara su reposición igual que cualquier otra salida (un solo chequeo
      // en lote; ni siquiera se consulta si el depósito de origen no es central).
      if (origen.esCentral) await verificarStockMinimoCentralEnLote(tx, filas.map((f) => f.articuloDepositoId));

      return tx.movimientoStock.findUnique({
        where: { id: movimiento.id },
        include: {
          deposito: true,
          depositoDestino: true,
          tipoMovStock: true,
          detalleMovimientos: { include: { articulo: true } },
        },
      });
    },
    OPCIONES_TRANSACCION
  );

  return movimientoCreado;
}

// HU-17: el destino confirma cuanto llegó realmente. Crea el movimiento de
// entrada vinculado, suma stock en destino solo por lo recibido, y deja
// registrada la diferencia (si la hay) en el detalle del movimiento
// original de salida.
async function confirmarRecepcion(id, { lineas, usuario } = {}) {
  const movimientoId = Number(id);
  if (!Number.isInteger(movimientoId)) {
    throw new ErrorDeNegocio("id de movimiento inválido.");
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new ErrorDeNegocio("Debe informar la cantidad recibida de al menos un artículo en 'lineas'.");
  }
  const articuloIdsRecibidos = lineas.map((l) => Number(l.articuloId));
  if (new Set(articuloIdsRecibidos).size !== articuloIdsRecibidos.length) {
    throw new ErrorDeNegocio("No se puede repetir el mismo artículo dos veces en 'lineas'.");
  }

  const movimiento = await prisma.movimientoStock.findUnique({
    where: { id: movimientoId },
    include: { detalleMovimientos: true },
  });
  if (!movimiento) {
    throw new ErrorDeNegocio("Movimiento no encontrado.", 404);
  }
  if (movimiento.estado !== "En tránsito" || !movimiento.depositoDestinoId) {
    throw new ErrorDeNegocio("El movimiento no es una transferencia pendiente de recepción.");
  }

  const recibidoPorArticulo = new Map(lineas.map((l) => [Number(l.articuloId), Number(l.cantidadRecibida)]));
  for (const det of movimiento.detalleMovimientos) {
    const recibido = recibidoPorArticulo.get(det.articuloId);
    if (!Number.isFinite(recibido) || recibido < 0) {
      throw new ErrorDeNegocio(`Falta informar la cantidad recibida para el artículo ${det.articuloId}.`);
    }
    if (recibido > Number(det.cantidad)) {
      throw new ErrorDeNegocio(
        `La cantidad recibida del artículo ${det.articuloId} no puede superar lo enviado (${det.cantidad}).`
      );
    }
  }

  // Requiere un tipo de movimiento de Entrada dedicado a transferencias
  // (sembrado por backend/scripts/seed-tipos-movimiento.js).
  const tipoEntrada = await prisma.tipoMovimientoStock.findFirst({
    where: { tipo: "E", activo: true, contexto: "TRANSFERENCIA" },
  });
  if (!tipoEntrada) {
    throw new ErrorDeNegocio(
      "No hay un tipo de movimiento de Entrada activo con contexto TRANSFERENCIA; correr seed-tipos-movimiento.js."
    );
  }

  const hayDiferencia = movimiento.detalleMovimientos.some(
    (det) => recibidoPorArticulo.get(det.articuloId) < Number(det.cantidad)
  );
  const estadoFinal = hayDiferencia ? "Con diferencia" : "Confirmado";

  const habilitacionesDestino = await prisma.articuloDeposito.findMany({
    where: {
      depositoId: movimiento.depositoDestinoId,
      articuloId: { in: movimiento.detalleMovimientos.map((d) => d.articuloId) },
      activo: true,
    },
  });
  const habilitacionPorArticulo = Object.fromEntries(habilitacionesDestino.map((h) => [h.articuloId, h]));

  const resultado = await prisma.$transaction(
    async (tx) => {
      const entrada = await tx.movimientoStock.create({
        data: {
          depositoId: movimiento.depositoDestinoId,
          tipoMovStockId: tipoEntrada.id,
          movimientoRelacionadoId: movimiento.id,
          estado: estadoFinal,
          usuario: usuario || null,
          detalle: `Recepción de transferencia #${movimiento.id}`,
        },
      });

      // En lote: la cantidad recibida de cada línea (una sentencia), el detalle de la entrada (createMany) y el stock
      // de destino (una sentencia). Las consultas dentro de la transacción no dependen de cuántos artículos lleguen.
      for (const det of movimiento.detalleMovimientos) {
        if (!habilitacionPorArticulo[det.articuloId]) {
          throw new ErrorDeNegocio(`El artículo ${det.articuloId} ya no está habilitado en el depósito destino.`);
        }
      }
      const casosRecibido = movimiento.detalleMovimientos.map(
        (det) => Prisma.sql`WHEN ${det.id} THEN ${recibidoPorArticulo.get(det.articuloId)}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE movimientos_stock_detalle SET cantidadRecibida = CASE id ${Prisma.join(casosRecibido, " ")} END WHERE id IN (${Prisma.join(movimiento.detalleMovimientos.map((det) => det.id))})`,
      );
      const recibidas = movimiento.detalleMovimientos.filter((det) => recibidoPorArticulo.get(det.articuloId) > 0);
      if (recibidas.length > 0) {
        await tx.movimientoStockDetalle.createMany({
          data: recibidas.map((det) => ({ movStockId: entrada.id, articuloId: det.articuloId, cantidad: recibidoPorArticulo.get(det.articuloId) })),
        });
        await incrementarStockEnLote(
          tx,
          recibidas.map((det) => ({ articuloDepositoId: habilitacionPorArticulo[det.articuloId].id, cantidad: recibidoPorArticulo.get(det.articuloId) })),
        );
      }

      await tx.movimientoStock.update({
        where: { id: movimiento.id },
        data: { estado: estadoFinal, movimientoRelacionadoId: entrada.id },
      });

      // Sprint 3 — Fase 4: si este movimiento es el que reservó una
      // TRANSFERENCIA (requerimientos.servicio.js:intentarAprobarTransferencia),
      // cierra el círculo. "Recibida" (no "Cerrada") si faltó algo — mismo
      // criterio que "Recibida con diferencia" en Ordenes de Compra: queda
      // una marca visible de que no llegó completo, sin re-disparar sola
      // otra reposición por la diferencia (eso lo decide una persona).
      const requerimiento = await tx.requerimientoReposicion.findUnique({
        where: { movimientoStockId: movimiento.id },
      });
      if (requerimiento) {
        const estadoRequerimiento = hayDiferencia ? ESTADOS_REQUERIMIENTO.RECIBIDA : ESTADOS_REQUERIMIENTO.CERRADA;
        await tx.requerimientoReposicion.update({
          where: { id: requerimiento.id },
          data: { estado: estadoRequerimiento },
        });
        await tx.requerimientoLog.create({
          data: {
            requerimientoId: requerimiento.id,
            usuario: usuario || "sistema",
            accion: `Recepción confirmada — ${estadoRequerimiento}`,
          },
        });
      }

      return tx.movimientoStock.findUnique({
        where: { id: entrada.id },
        include: {
          deposito: true,
          tipoMovStock: true,
          detalleMovimientos: { include: { articulo: true } },
        },
      });
    },
    OPCIONES_TRANSACCION
  );

  return resultado;
}

// Trae la transferencia "Con diferencia" puntual (la fila con
// depositoDestinoId, no su entrada relacionada — ver el comentario de
// confirmarRecepcion sobre por qué ambas comparten `estado`) y valida que
// todavía se pueda actuar sobre su diferencia. Reusado por
// marcarDiferenciaRevisada y pedirFaltantesPorDiferencia.
async function obtenerTransferenciaConDiferencia(id) {
  const movimientoId = Number(id);
  if (!Number.isInteger(movimientoId)) throw new ErrorDeNegocio("id de movimiento inválido.");

  const movimiento = await prisma.movimientoStock.findUnique({
    where: { id: movimientoId },
    include: { detalleMovimientos: true },
  });
  if (!movimiento) throw new ErrorDeNegocio("Movimiento no encontrado.", 404);
  if (movimiento.estado !== "Con diferencia" || !movimiento.depositoDestinoId) {
    throw new ErrorDeNegocio("Este movimiento no es una transferencia Con diferencia.");
  }
  if (movimiento.diferenciaRevisada) {
    throw new ErrorDeNegocio("La diferencia de este movimiento ya fue marcada como revisada.", 409);
  }
  return movimiento;
}

// HU-14/17 — punto 2 del rediseño de Recepciones: registra que alguien ya
// miró la diferencia entre lo enviado y lo recibido, sin tocar
// cantidadRecibida ni ningún otro dato de la recepción en sí. Una vez
// revisada, listarMovimientos({estado:"Con diferencia"}) la sigue
// devolviendo (el estado no cambia) — es la pantalla de Recepciones la que
// decide no mostrarla más en la subsección activa, filtrando por
// diferenciaRevisada del lado del cliente.
async function marcarDiferenciaRevisada(id, { motivoResolucion, usuario } = {}) {
  const movimiento = await obtenerTransferenciaConDiferencia(id);
  if (!MOTIVOS_RESOLUCION_DIFERENCIA.includes(motivoResolucion)) {
    throw new ErrorDeNegocio(`motivoResolucion inválido. Valores permitidos: ${MOTIVOS_RESOLUCION_DIFERENCIA.join(", ")}`);
  }

  return prisma.movimientoStock.update({
    where: { id: movimiento.id },
    data: {
      diferenciaRevisada: true,
      motivoResolucion,
      revisadoPor: usuario || null,
      fechaRevision: new Date(),
    },
  });
}

// HU-14/17 — punto 3 del rediseño: atajo "Pedir los N faltantes". Arma un
// RequerimientoReposicion de tipo TRANSFERENCIA con lo que faltó de cada
// línea y reusa crearRequerimiento tal cual (mismo motor que el alta manual
// desde el modal) — no reimplementa la resolución del depósito central, la
// habilitación ni el dedupe contra un pedido ya abierto: si algo de eso
// falla (ej. el artículo no tiene central asignado), el error de
// crearRequerimiento sube tal cual, sin marcar la diferencia como resuelta.
async function pedirFaltantesPorDiferencia(id, { usuario } = {}) {
  const movimiento = await obtenerTransferenciaConDiferencia(id);

  const faltantes = movimiento.detalleMovimientos
    .filter((d) => d.cantidadRecibida != null && Number(d.cantidadRecibida) < Number(d.cantidad))
    .map((d) => ({
      articuloId: d.articuloId,
      cantidadSolicitada: Number(d.cantidad) - Number(d.cantidadRecibida),
    }));
  if (faltantes.length === 0) {
    throw new ErrorDeNegocio("Este movimiento no tiene líneas con diferencia para pedir.");
  }

  // crearRequerimiento tira SU PROPIO ErrorDeNegocio (clase distinta a la
  // de este archivo — mismo patrón repetido en cada servicio, ver
  // ordenesCompra.servicio.js) — sin este catch, el `instanceof
  // movimientosStockServicio.ErrorDeNegocio` del controlador no lo
  // reconoce y una validación real (ej. "sin depósito central asignado")
  // le llegaría al usuario como un 500 genérico en vez del mensaje útil.
  let requerimiento;
  try {
    requerimiento = await crearRequerimiento({
      depositoId: movimiento.depositoDestinoId,
      tipo: TIPOS_REQUERIMIENTO.TRANSFERENCIA,
      solicitante: usuario,
      detalle: faltantes,
    });
  } catch (err) {
    if (typeof err.statusCode === "number") {
      throw new ErrorDeNegocio(err.message, err.statusCode);
    }
    throw err;
  }

  await prisma.requerimientoLog.create({
    data: {
      requerimientoId: requerimiento.id,
      usuario: usuario || "sistema",
      accion: `Generado automáticamente por la diferencia de MOV-${String(movimiento.id).padStart(4, "0")}`,
    },
  });

  await prisma.movimientoStock.update({
    where: { id: movimiento.id },
    data: {
      diferenciaRevisada: true,
      motivoResolucion: "Se generó pedido por la diferencia",
      revisadoPor: usuario || null,
      fechaRevision: new Date(),
    },
  });

  return requerimiento;
}

module.exports = {
  registrarEntrada,
  listarMovimientos,
  registrarTransferencia,
  confirmarRecepcion,
  marcarDiferenciaRevisada,
  pedirFaltantesPorDiferencia,
  ErrorDeNegocio,
};