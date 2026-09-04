// src/modulos/requerimientos/requerimientos.servicio.js
//
// HU-81 — el pedido interno que arranca el ciclo de compra: un depósito
// pide reponer uno o varios artículos. Puede cargarse a mano o salir de
// una alerta de stock mínimo (HU-8, Sprint 1), que es el mismo alta con
// origen: "ALERTA" — no hay un endpoint aparte.

const prisma = require("../../lib/prisma");
const { ESTADOS_REQUERIMIENTO, ORIGENES_REQUERIMIENTO, OPCIONES_TRANSACCION } = require("../../lib/constantes");

class ErrorDeNegocio extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ErrorDeNegocio";
    this.statusCode = statusCode;
  }
}

const INCLUDE_DETALLE = {
  deposito: { select: { id: true, nombre: true } },
  detalle: {
    include: { articulo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true } } },
    orderBy: { id: "asc" },
  },
};

async function crearRequerimiento({ depositoId, origen, solicitante, detalle }) {
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

  // Cabecera + N líneas = 2 tablas, así que va en transacción (Guía
  // Técnica, sección 0): si falla el detalle no puede quedar un
  // requerimiento vacío dando vueltas.
  const creado = await prisma.$transaction(async (tx) => {
    const requerimiento = await tx.requerimientoReposicion.create({
      data: {
        depositoId,
        origen,
        solicitante: solicitante || null,
        estado: ESTADOS_REQUERIMIENTO.PENDIENTE,
      },
    });
    await tx.requerimientoDetalle.createMany({
      data: detalle.map((d) => ({
        requerimientoId: requerimiento.id,
        articuloId: d.articuloId,
        cantidadSolicitada: d.cantidadSolicitada,
      })),
    });
    return requerimiento;
  }, OPCIONES_TRANSACCION);

  // Relectura con include fuera del commit (ver OPCIONES_TRANSACCION).
  return prisma.requerimientoReposicion.findUnique({ where: { id: creado.id }, include: INCLUDE_DETALLE });
}

async function listarRequerimientos({ estado, depositoId, page = 1, pageSize = 10 } = {}) {
  const where = {
    ...(estado ? { estado } : {}),
    ...(depositoId ? { depositoId: Number(depositoId) } : {}),
  };

  // Secuencial, no Promise.all: la base remota tiene un pool de solo 3
  // conexiones y esta lista ya se pide junto con listarDepositos en la
  // misma carga de pantalla — ver el incidente documentado en
  // pagos.servicio.js que llevó a este mismo cambio ahí.
  const items = await prisma.requerimientoReposicion.findMany({
    where,
    include: {
      deposito: { select: { id: true, nombre: true } },
      detalle: { select: { id: true } },
      presupuestos: { select: { id: true, estado: true, _count: { select: { detalle: true } } } },
    },
    orderBy: { fecha: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await prisma.requerimientoReposicion.count({ where });

  // La pantalla necesita "cuántos artículos" y "cuántos presupuestos ya
  // cotizaron" sin traerse el detalle entero de cada uno. "Cotizó de
  // verdad" sale de si mandó precios (_count.detalle > 0), no del estado
  // — aprobarPresupuesto pone en "Rechazado" a TODOS los no ganadores al
  // adjudicar, incluidos los que se quedaron en "Solicitado" sin
  // responder nunca. Mismo criterio que listarPresupuestos en
  // presupuestos.servicio.js.
  const conResumen = items.map(({ detalle, presupuestos, ...r }) => ({
    ...r,
    cantidadArticulos: detalle.length,
    cantidadPresupuestos: presupuestos.length,
    presupuestosCotizados: presupuestos.filter((p) => p._count.detalle > 0).length,
  }));

  return { items: conResumen, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// Ficha completa: incluye los presupuestos asociados para que la pantalla
// de detalle no tenga que pedirlos en una segunda llamada.
async function obtenerRequerimientoPorId(id) {
  return prisma.requerimientoReposicion.findUnique({
    where: { id },
    include: {
      ...INCLUDE_DETALLE,
      presupuestos: {
        include: {
          proveedor: { select: { id: true, razonSocial: true, cuit: true } },
          detalle: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });
}

module.exports = {
  ErrorDeNegocio,
  ESTADOS_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  crearRequerimiento,
  listarRequerimientos,
  obtenerRequerimientoPorId,
};
