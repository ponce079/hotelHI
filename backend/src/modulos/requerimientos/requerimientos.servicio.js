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
    // categoria: la necesita SolicitarPresupuestosModal (frontend) para
    // saber qué rubros del padrón cubren este pedido — sin ella, todo
    // proveedor cae en el fallback "sin categoría, se muestra habilitado".
    include: { articulo: { select: { id: true, codigo: true, nombre: true, unidadMedida: true, categoria: true } } },
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

async function listarRequerimientos({ estado, depositoId, q, incluirAnulados = false, page = 1, pageSize = 10 } = {}) {
  const texto = (q ?? "").trim();
  // El buscador acepta el número de requerimiento (con o sin el prefijo
  // "REQ-" y los ceros a la izquierda), el depósito o el solicitante —
  // mismo criterio flexible que el buscador de Proveedores (razón social
  // o CUIT en un solo campo).
  const idBuscado = Number(texto.replace(/^req-?0*/i, ""));

  const where = {
    ...(estado ? { estado } : {}),
    ...(depositoId ? { depositoId: Number(depositoId) } : {}),
    // Por defecto, un anulado no aparece: nunca pasó de "Pendiente" (no se
    // puede anular después), así que solo afecta ese bucket. Requerimientos
    // (la pantalla de seguimiento) pide incluirAnulados=true para verlo
    // igual, con su propio badge — Presupuestos no, porque un anulado no
    // tiene nada que cotizar.
    ...(incluirAnulados ? {} : { anulado: false }),
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
  if (existente.estado !== ESTADOS_REQUERIMIENTO.PENDIENTE) {
    throw new ErrorDeNegocio(
      'Solo se puede anular un requerimiento en estado "Pendiente" — una vez que se pidieron presupuestos, ya compromete a los proveedores invitados.',
      409
    );
  }
  return prisma.requerimientoReposicion.update({
    where: { id },
    data: { anulado: true, motivoAnulacion: motivo },
    include: INCLUDE_DETALLE,
  });
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
  actualizarRequerimiento,
  anularRequerimiento,
};
