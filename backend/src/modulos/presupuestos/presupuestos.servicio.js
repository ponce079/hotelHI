// src/modulos/presupuestos/presupuestos.servicio.js
//
// HU-82 a 84 — todo el ciclo de cotización: invitar proveedores, cargar
// lo que cotiza cada uno, comparar y adjudicar uno.
//
// Decisión de modelado (Guía Técnica, sección 3): el backlog habla de
// "Solicitud de presupuesto" y "Presupuesto" como dos cosas, pero en el
// modelo son UNA tabla. Se crea una fila Presupuesto por proveedor
// invitado en estado "Solicitado" (sin precios todavía), y esa misma fila
// se completa cuando llega la cotización. No hay tabla ni flujo aparte
// para "la solicitud".

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { redondear } = require("../../lib/comprobantes");
const {
  ESTADOS_REQUERIMIENTO,
  ESTADOS_PRESUPUESTO,
  TIPOS_REQUERIMIENTO,
  OPCIONES_TRANSACCION,
  rubroCubreCategoria,
} = require("../../lib/constantes");

class ErrorDeNegocio extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ErrorDeNegocio";
    this.statusCode = statusCode;
  }
}

const INCLUDE_FICHA = {
  proveedor: { select: { id: true, razonSocial: true, cuit: true, condicionComercial: true } },
  requerimiento: {
    include: {
      deposito: { select: { id: true, nombre: true } },
      detalle: {
        include: { articulo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true } } },
        orderBy: { id: "asc" },
      },
    },
  },
  detalle: {
    include: { articulo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true } } },
    orderBy: { id: "asc" },
  },
  // HU-22: para que la pantalla de comparación sepa si ya se generó la OC
  // de este presupuesto (y no ofrezca generarla dos veces).
  ordenCompra: { select: { id: true, numero: true } },
};

// Punto 9 (adjuntar presupuesto): `archivoAdjunto` es un BLOB que puede
// pesar hasta 5MB — nunca debe viajar en un listado ni en una ficha de
// paso, solo en el endpoint dedicado a descargarlo. Todo `include` de acá
// abajo que no sea ESE endpoint usa este `omit` (Prisma trae todos los
// escalares por default con `include`, no hay forma de "no pedirlo" salvo
// excluirlo a mano).
const OMIT_ARCHIVO = { archivoAdjunto: true };

// Total de un presupuesto = Σ (precioUnitario × cantidad solicitada) + flete.
// La cantidad NO vive en PresupuestoDetalle: es la del requerimiento, que
// es la misma para todos los proveedores invitados (por eso son
// comparables). Se calcula acá y nunca se persiste, así no puede quedar
// desincronizado si se corrige un precio.
function calcularTotales(presupuesto) {
  const cantidades = new Map(
    (presupuesto.requerimiento?.detalle ?? []).map((d) => [d.articuloId, Number(d.cantidadSolicitada)])
  );
  const subtotal = (presupuesto.detalle ?? []).reduce(
    (acc, d) => acc + Number(d.precioUnitario) * (cantidades.get(d.articuloId) ?? 0),
    0
  );
  const flete = Number(presupuesto.costoFlete ?? 0);
  return {
    subtotal: redondear(subtotal),
    flete: redondear(flete),
    total: redondear(subtotal + flete),
  };
}

function conTotales(presupuesto) {
  if (!presupuesto) return presupuesto;
  return { ...presupuesto, ...calcularTotales(presupuesto) };
}

// HU-82 — invitar a cotizar. Crea una fila por proveedor y mueve el
// requerimiento a "En cotización". `requiereFlete` se guarda en el
// requerimiento (no en cada presupuesto): es una condición del pedido,
// igual para todos los invitados.
async function solicitarPresupuestos(requerimientoId, { proveedorIds, requiereFlete }) {
  const requerimiento = await prisma.requerimientoReposicion.findUnique({
    where: { id: requerimientoId },
    include: {
      presupuestos: { omit: OMIT_ARCHIVO },
      detalle: { include: { articulo: { select: { categoria: true } } } },
    },
  });
  if (!requerimiento) throw new ErrorDeNegocio("Requerimiento no encontrado", 404);
  // Sprint 3: una TRANSFERENCIA no tiene proveedor — la resuelve el
  // sistema contra el depósito central, nunca pidiendo presupuestos.
  if (requerimiento.tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA) {
    throw new ErrorDeNegocio('Un requerimiento de tipo "TRANSFERENCIA" no pide presupuestos a proveedores.', 409);
  }
  // Punto 4 (Comparación de presupuestos): además del alta inicial
  // (Pendiente -> En cotización), esta misma función ahora también cubre
  // "sumar un proveedor más" a uno que YA está en cotización — evita
  // duplicar en un segundo lugar la validación de rubro/proveedor activo.
  // Una vez Aprobado (o cualquier otro estado) ya no se puede: adjudicar
  // cierra la comparación.
  const yaEnCotizacion = requerimiento.estado === ESTADOS_REQUERIMIENTO.EN_COTIZACION;
  if (!yaEnCotizacion && requerimiento.estado !== ESTADOS_REQUERIMIENTO.PENDIENTE) {
    throw new ErrorDeNegocio(
      `Solo se pueden pedir presupuestos de un requerimiento en estado "${ESTADOS_REQUERIMIENTO.PENDIENTE}" o "${ESTADOS_REQUERIMIENTO.EN_COTIZACION}" (este está en "${requerimiento.estado}")`,
      409
    );
  }

  const unicos = [...new Set(proveedorIds)];
  const proveedores = await prisma.proveedor.findMany({
    where: { id: { in: unicos } },
    include: { rubros: true },
  });
  if (proveedores.length !== unicos.length) {
    throw new ErrorDeNegocio("Alguno de los proveedores indicados no existe", 404);
  }
  const inactivo = proveedores.find((p) => !p.activo);
  if (inactivo) {
    throw new ErrorDeNegocio(`El proveedor "${inactivo.razonSocial}" está dado de baja y no puede ser invitado`, 400);
  }

  // Sumar un proveedor ya invitado chocaría contra el
  // @@unique([requerimientoId, proveedorId]) con un P2002 sin explicación
  // — se valida acá para dar un mensaje claro de cuál.
  const idsYaInvitados = new Set(requerimiento.presupuestos.map((p) => p.proveedorId));
  const yaInvitados = proveedores.filter((p) => idsYaInvitados.has(p.id));
  if (yaInvitados.length > 0) {
    const nombres = yaInvitados.map((p) => p.razonSocial).join(", ");
    throw new ErrorDeNegocio(
      `${nombres} ya ${yaInvitados.length === 1 ? "fue invitado" : "fueron invitados"} a cotizar este requerimiento.`,
      409
    );
  }

  // HU-82: solo se puede invitar a proveedores habilitados para el rubro
  // de los artículos pedidos — antes esto era solo un filtro visual en
  // SolicitarPresupuestosPage (desactivable con "Todo el padrón"), sin
  // ningún bloqueo real acá.
  const categorias = [...new Set(requerimiento.detalle.map((d) => d.articulo.categoria))];
  const sinRubroHabilitado = proveedores.filter(
    (p) => !p.rubros.some((r) => categorias.some((c) => rubroCubreCategoria(r.rubro, c)))
  );
  if (sinRubroHabilitado.length > 0) {
    const nombres = sinRubroHabilitado.map((p) => p.razonSocial).join(", ");
    throw new ErrorDeNegocio(
      `${nombres} no ${sinRubroHabilitado.length === 1 ? "tiene un rubro habilitado" : "tienen un rubro habilitado"} para los artículos de este requerimiento.`,
      400
    );
  }

  // Solo las dos escrituras van adentro de la transacción; la relectura
  // para devolver el resultado va después del commit (ver
  // OPCIONES_TRANSACCION en lib/constantes.js).
  await prisma.$transaction(async (tx) => {
    await tx.presupuesto.createMany({
      data: unicos.map((proveedorId) => ({
        requerimientoId,
        proveedorId,
        estado: ESTADOS_PRESUPUESTO.SOLICITADO,
      })),
    });
    // `requiereFlete` es una condición del pedido, igual para todos los
    // invitados (ver comentario de arriba) — si ya estaba "En cotización"
    // ese valor ya está fijado por la invitación inicial y no se pisa acá
    // solo porque alguien sume un proveedor más.
    if (!yaEnCotizacion) {
      await tx.requerimientoReposicion.update({
        where: { id: requerimientoId },
        data: { estado: ESTADOS_REQUERIMIENTO.EN_COTIZACION, requiereFlete: Boolean(requiereFlete) },
      });
    }
  }, OPCIONES_TRANSACCION);

  return prisma.requerimientoReposicion.findUnique({
    where: { id: requerimientoId },
    include: {
      presupuestos: { omit: OMIT_ARCHIVO, include: { proveedor: { select: { id: true, razonSocial: true } } } },
    },
  });
}

// HU-83 — cargar lo que cotizó el proveedor. Es un reemplazo completo del
// detalle: se borran los precios anteriores y se escriben los nuevos, para
// que una segunda carga no deje mezclados precios de dos cotizaciones.
async function cargarPresupuesto(id, { precios, plazoEntrega, costoFlete, fechaLimiteVigencia }) {
  const presupuesto = await prisma.presupuesto.findUnique({
    where: { id },
    omit: OMIT_ARCHIVO,
    include: { requerimiento: { include: { detalle: true } } },
  });
  if (!presupuesto) throw new ErrorDeNegocio("Presupuesto no encontrado", 404);
  if (presupuesto.estado !== ESTADOS_PRESUPUESTO.SOLICITADO) {
    // Evita cargar dos veces: una vez cotizado hay que rechazarlo o
    // adjudicarlo, no reescribirle los precios por atrás.
    throw new ErrorDeNegocio(
      `Este presupuesto ya está en estado "${presupuesto.estado}": solo se puede cargar uno en estado "${ESTADOS_PRESUPUESTO.SOLICITADO}"`,
      409
    );
  }

  // Ningún artículo puede venir dos veces: si no se rechaza acá, el
  // Set de la validación de abajo lo deduplica y el chequeo de longitud
  // puede dar falso positivo (ej. [1,1,3] con "2" faltante cuadra en
  // cantidad contra un pedido [1,2,3]) — el duplicado recién explota
  // más abajo como un P2002 al insertar, con un mensaje que no dice la
  // causa real. Mismo criterio que crearOrdenPago en pagos.servicio.js.
  const idsCrudos = precios.map((p) => p.articuloId);
  if (new Set(idsCrudos).size !== idsCrudos.length) {
    throw new ErrorDeNegocio("No se puede cotizar el mismo artículo dos veces", 400);
  }

  // Los artículos cotizados tienen que ser exactamente los del
  // requerimiento — ni de más (algo que nadie pidió) ni de menos (una
  // línea sin precio haría que el total mienta).
  const pedidos = presupuesto.requerimiento.detalle.map((d) => d.articuloId).sort();
  const cotizados = idsCrudos.slice().sort();
  if (pedidos.length !== cotizados.length || pedidos.some((id, i) => id !== cotizados[i])) {
    throw new ErrorDeNegocio("Hay que cotizar exactamente los artículos del requerimiento, uno por línea", 400);
  }

  // El flete solo se guarda si el requerimiento lo pidió (Guía Técnica,
  // sección 3): si no, queda null y la pantalla ni lo muestra.
  const fleteAGuardar = presupuesto.requerimiento.requiereFlete ? (costoFlete ?? 0) : null;

  // Fecha de vigencia: opcional, pero si viene tiene que ser una fecha
  // real y no puede ser anterior a hoy — cargar una oferta "vencida antes
  // de cargarla" no tiene sentido y probablemente sea un error de tipeo.
  // NOTA para revisión de equipo: hoy es puramente informativa, no
  // bloquea adjudicar el presupuesto aunque ya haya vencido — si se
  // decide que sí debería bloquear, el chequeo va en aprobarPresupuesto,
  // no acá.
  let fechaVigenciaAGuardar = null;
  if (fechaLimiteVigencia) {
    const parsed = new Date(fechaLimiteVigencia);
    if (Number.isNaN(parsed.getTime())) {
      throw new ErrorDeNegocio("La fecha límite de vigencia no es una fecha válida", 400);
    }
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (parsed < hoy) {
      throw new ErrorDeNegocio("La fecha límite de vigencia no puede ser anterior a hoy", 400);
    }
    fechaVigenciaAGuardar = parsed;
  }

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoDetalle.deleteMany({ where: { presupuestoId: id } });
    await tx.presupuestoDetalle.createMany({
      data: precios.map((p) => ({
        presupuestoId: id,
        articuloId: p.articuloId,
        precioUnitario: p.precioUnitario,
      })),
    });
    await tx.presupuesto.update({
      where: { id },
      data: {
        estado: ESTADOS_PRESUPUESTO.PENDIENTE_APROBACION,
        plazoEntrega: plazoEntrega?.trim() || null,
        costoFlete: fleteAGuardar,
        fechaLimiteVigencia: fechaVigenciaAGuardar,
      },
    });
  }, OPCIONES_TRANSACCION);

  // La ficha con includes son varias consultas más: fuera del commit.
  return conTotales(
    await prisma.presupuesto.findUnique({ where: { id }, omit: OMIT_ARCHIVO, include: INCLUDE_FICHA })
  );
}

// HU-84 — la transacción más importante del sprint. Adjudicar un
// presupuesto son tres escrituras que tienen que pasar juntas o ninguna:
// si se cae a la mitad, un requerimiento podría quedar "Aprobado" con dos
// presupuestos adjudicados, o con ninguno.
async function aprobarPresupuesto(id, usuario, comentario) {
  // Chequeo rápido ("fail fast") antes de la transacción, no toma locks.
  const existe = await prisma.presupuesto.findUnique({ where: { id }, select: { id: true, requerimientoId: true } });
  if (!existe) throw new ErrorDeNegocio("Presupuesto no encontrado", 404);

  await prisma.$transaction(async (tx) => {
    // Re-chequeo protegido contra carreras: FOR UPDATE bloquea todos los
    // presupuestos del requerimiento hasta que esta transacción termine,
    // así una segunda adjudicación (de otro presupuesto del mismo
    // requerimiento) que llegue casi al mismo tiempo espera a que esta
    // commitee y ve el ADJUDICADO ya puesto, en vez de pisarlo. Mismo
    // patrón que anularOrdenPago en pagos.servicio.js.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM presupuestos WHERE requerimientoId = ${existe.requerimientoId} FOR UPDATE`
    );

    const presupuesto = await tx.presupuesto.findUnique({
      where: { id },
      omit: OMIT_ARCHIVO,
      include: {
        requerimiento: { include: { presupuestos: { omit: OMIT_ARCHIVO } } },
        proveedor: { select: { razonSocial: true } },
      },
    });
    if (presupuesto.estado !== ESTADOS_PRESUPUESTO.PENDIENTE_APROBACION) {
      throw new ErrorDeNegocio(
        `Solo se puede aprobar un presupuesto en estado "${ESTADOS_PRESUPUESTO.PENDIENTE_APROBACION}" (este está en "${presupuesto.estado}")`,
        409
      );
    }

    // No se puede adjudicar dos veces el mismo requerimiento: el primero
    // que se aprueba deja al resto en "Rechazado" y cierra el pedido.
    const yaAdjudicado = presupuesto.requerimiento.presupuestos.find(
      (p) => p.estado === ESTADOS_PRESUPUESTO.ADJUDICADO
    );
    if (yaAdjudicado) {
      throw new ErrorDeNegocio(
        `El requerimiento #${presupuesto.requerimientoId} ya tiene un presupuesto adjudicado (#${yaAdjudicado.id})`,
        409
      );
    }

    await tx.presupuesto.update({
      where: { id },
      data: {
        estado: ESTADOS_PRESUPUESTO.ADJUDICADO,
        fechaAdjudicacion: new Date(),
        comentarioAdjudicacion: comentario?.trim() || null,
      },
    });
    await tx.presupuesto.updateMany({
      where: { requerimientoId: presupuesto.requerimientoId, id: { not: id } },
      data: { estado: ESTADOS_PRESUPUESTO.RECHAZADO },
    });
    // Aprobar el requerimiento es CONSECUENCIA de adjudicar un
    // presupuesto, nunca una acción suelta — es la única vía para que un
    // requerimiento llegue a "Aprobado" (Guía Técnica, sección 0).
    await tx.requerimientoReposicion.update({
      where: { id: presupuesto.requerimientoId },
      data: { estado: ESTADOS_REQUERIMIENTO.APROBADO },
    });
    // Sin este registro, el nodo "Aprobado" del timeline de la ficha de
    // Requerimiento no tiene de dónde sacar fecha/usuario (ver
    // construirEtapasCompra en RequerimientoDetallePage.jsx).
    await tx.requerimientoLog.create({
      data: {
        requerimientoId: presupuesto.requerimientoId,
        usuario: usuario || "gerente",
        accion: `Presupuesto adjudicado — ${presupuesto.proveedor.razonSocial}`,
      },
    });
  }, OPCIONES_TRANSACCION);

  // La ficha con includes queda fuera del commit — ver comentario de
  // cargarPresupuesto sobre por qué (P2028 con la base remota).
  return conTotales(
    await prisma.presupuesto.findUnique({ where: { id }, omit: OMIT_ARCHIVO, include: INCLUDE_FICHA })
  );
}

// Sprint 3 — punto 9: "compra express". Para un requerimiento COMPRA
// marcado urgente, salta la instancia de invitar a varios proveedores y
// esperar cotizaciones: se elige UN proveedor y se cargan sus precios de
// una sola vez. No es un camino nuevo — es la misma secuencia de siempre
// (solicitarPresupuestos -> cargarPresupuesto -> aprobarPresupuesto),
// reutilizada tal cual, solo que la dispara un único llamado en vez de
// tres pantallas separadas. Deliberadamente NO genera la Orden de Compra:
// esa sigue siendo una acción manual y visible desde la bandeja de
// Órdenes de Compra (así quedó el flujo normal tras el rediseño de
// Sprint 2) — "express" acorta la cotización, no salta la revisión antes
// de emitirle una orden real a un proveedor.
async function generarPresupuestoExpress(requerimientoId, { proveedorId, precios, plazoEntrega, costoFlete }) {
  const requerimiento = await prisma.requerimientoReposicion.findUnique({ where: { id: requerimientoId } });
  if (!requerimiento) throw new ErrorDeNegocio("Requerimiento no encontrado", 404);
  if (!requerimiento.urgente) {
    throw new ErrorDeNegocio("La compra express solo está disponible para requerimientos marcados urgentes.", 409);
  }

  // Las validaciones de tipo/estado/proveedor/rubro ya viven en
  // solicitarPresupuestos — no hay que repetirlas acá. Su propio resultado
  // ya trae el presupuesto recién creado (un solo proveedor invitado, así
  // que hay exactamente uno) — evita un findUnique de más contra una base
  // remota que ya mostró latencia alta en esta misma sesión.
  const conPresupuesto = await solicitarPresupuestos(requerimientoId, {
    proveedorIds: [proveedorId],
    requiereFlete: costoFlete != null && Number(costoFlete) > 0,
  });
  const presupuestoId = conPresupuesto.presupuestos[0].id;

  await cargarPresupuesto(presupuestoId, { precios, plazoEntrega, costoFlete });
  return aprobarPresupuesto(presupuestoId);
}

// Listado para la pantalla de comparación: todos los presupuestos de un
// requerimiento, con sus totales ya calculados y ordenados de más barato
// a más caro (los que todavía no cotizaron quedan al final).
async function listarPresupuestos({ requerimientoId, proveedorId, estado } = {}) {
  const items = await prisma.presupuesto.findMany({
    where: {
      ...(requerimientoId ? { requerimientoId: Number(requerimientoId) } : {}),
      ...(proveedorId ? { proveedorId: Number(proveedorId) } : {}),
      ...(estado ? { estado } : {}),
    },
    omit: OMIT_ARCHIVO,
    include: INCLUDE_FICHA,
    orderBy: { id: "asc" },
  });

  const conTotal = items.map(conTotales);
  // "Cotizó de verdad" tiene que salir de si mandó precios (detalle no
  // vacío), no del estado — aprobarPresupuesto pone en "Rechazado" a
  // TODOS los no ganadores al adjudicar, incluidos los que se quedaron
  // en "Solicitado" sin responder nunca. Guiarse solo por el estado
  // (!== SOLICITADO) los hacía pasar como cotizados con total $0 (sin
  // detalle) y ganaban la comparación de "más barato" sin haber cotizado.
  const fueCotizado = (p) => (p.detalle?.length ?? 0) > 0;
  const cotizados = conTotal.filter(fueCotizado);
  const mejorTotal = cotizados.length > 0 ? Math.min(...cotizados.map((p) => p.total)) : null;

  return {
    items: conTotal
      .slice()
      .sort((a, b) => {
        const aCotizo = fueCotizado(a);
        const bCotizo = fueCotizado(b);
        if (aCotizo !== bCotizo) return aCotizo ? -1 : 1;
        return a.total - b.total;
      })
      .map((p) => ({ ...p, esMasBajo: fueCotizado(p) && p.total === mejorTotal })),
    total: conTotal.length,
    mejorTotal,
  };
}

async function obtenerPresupuestoPorId(id) {
  const presupuesto = await prisma.presupuesto.findUnique({ where: { id }, omit: OMIT_ARCHIVO, include: INCLUDE_FICHA });
  return conTotales(presupuesto);
}

// Punto 9 — el archivo adjunto SÍ se pide acá, a propósito: es el único
// lugar de todo el módulo que lo necesita (servir la descarga). `select`
// en vez de `include`: no hace falta nada del resto de la ficha.
async function obtenerAdjuntoPresupuesto(id) {
  return prisma.presupuesto.findUnique({
    where: { id },
    select: { archivoAdjunto: true, archivoNombre: true, archivoTipo: true, archivoTamano: true },
  });
}

const TIPOS_ARCHIVO_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANO_MAXIMO_ARCHIVO = 5 * 1024 * 1024; // 5MB

// Guarda (o reemplaza) el respaldo documental de un presupuesto — no exige
// ningún estado puntual: a diferencia de cargar precios (una sola vez,
// solo en "Solicitado"), el archivo es de referencia y se puede agregar o
// cambiar en cualquier momento del ciclo de vida del presupuesto.
async function guardarAdjuntoPresupuesto(id, { buffer, mimetype, originalname, size }) {
  const existe = await prisma.presupuesto.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw new ErrorDeNegocio("Presupuesto no encontrado", 404);
  if (!TIPOS_ARCHIVO_PERMITIDOS.includes(mimetype)) {
    throw new ErrorDeNegocio("Solo se aceptan archivos PDF, JPG o PNG", 400);
  }
  if (size > TAMANO_MAXIMO_ARCHIVO) {
    throw new ErrorDeNegocio("El archivo no puede superar los 5MB", 400);
  }
  await prisma.presupuesto.update({
    where: { id },
    data: { archivoAdjunto: buffer, archivoNombre: originalname, archivoTipo: mimetype, archivoTamano: size },
  });
  return { archivoNombre: originalname, archivoTipo: mimetype, archivoTamano: size };
}

async function eliminarAdjuntoPresupuesto(id) {
  const existe = await prisma.presupuesto.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw new ErrorDeNegocio("Presupuesto no encontrado", 404);
  await prisma.presupuesto.update({
    where: { id },
    data: { archivoAdjunto: null, archivoNombre: null, archivoTipo: null, archivoTamano: null },
  });
}

module.exports = {
  ErrorDeNegocio,
  ESTADOS_PRESUPUESTO,
  solicitarPresupuestos,
  cargarPresupuesto,
  aprobarPresupuesto,
  generarPresupuestoExpress,
  listarPresupuestos,
  obtenerPresupuestoPorId,
  calcularTotales,
  obtenerAdjuntoPresupuesto,
  guardarAdjuntoPresupuesto,
  eliminarAdjuntoPresupuesto,
  TIPOS_ARCHIVO_PERMITIDOS,
  TAMANO_MAXIMO_ARCHIVO,
};
