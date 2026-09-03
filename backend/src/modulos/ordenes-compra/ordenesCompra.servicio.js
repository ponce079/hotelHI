// src/modulos/ordenes-compra/ordenesCompra.servicio.js
//
// Lógica de negocio pura (HU-22 a 25, HU-85). No sabe nada de HTTP/Express.
// Sigue el mismo patrón que pagos.servicio.js y movimientosStock.servicio.js:
// clase ErrorDeNegocio con statusCode, prisma singleton, transacciones con
// timeout explícito.

const prisma = require("../../lib/prisma");
const { crearConNumeroSecuencial } = require("../../lib/numeracion");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

const LIMITE_APROBACION_OC = Number(process.env.LIMITE_APROBACION_OC || 0);

function requiereAprobacion(montoTotal, flete) {
  const total = Number(montoTotal) + Number(flete || 0);
  return total > LIMITE_APROBACION_OC;
}

// ---------------------------------------------------------------------------
// HU-22 · Generar OC desde un presupuesto adjudicado
// Este endpoint cuelga de /api/presupuestos/:id/generar-oc en el prototipo,
// pero la lógica es de este módulo — coordinar con Tomás/Agustín para que
// agreguen una sola línea a su presupuestos.routes.js apuntando acá.
// ---------------------------------------------------------------------------
async function generarOC({ presupuestoId, usuario }) {
  const id = Number(presupuestoId);
  if (!Number.isInteger(id)) {
    throw new ErrorDeNegocio("presupuestoId inválido.");
  }

  const presupuesto = await prisma.presupuesto.findUnique({
    where: { id },
    include: {
      detalle: true, // PresupuestoDetalle[] -> { articuloId, precioUnitario }
      requerimiento: { include: { detalle: true } }, // RequerimientoDetalle[] -> { articuloId, cantidadSolicitada }
    },
  });
  if (!presupuesto) {
    throw new ErrorDeNegocio("Presupuesto no encontrado.", 404);
  }
  if (presupuesto.estado !== "Adjudicado") {
    throw new ErrorDeNegocio("Solo se puede generar una orden de compra desde un presupuesto adjudicado.", 409);
  }

  const ocExistente = await prisma.ordenCompra.findUnique({ where: { presupuestoId: id } });
  if (ocExistente) {
    throw new ErrorDeNegocio("Este presupuesto ya tiene una orden de compra generada.", 409);
  }

  // cantidad viene del requerimiento, precio viene del presupuesto -> se
  // cruzan por articuloId (PresupuestoDetalle no tiene columna de cantidad).
  const precioPorArticulo = new Map(
    presupuesto.detalle.map((d) => [d.articuloId, Number(d.precioUnitario)])
  );

  const lineasOC = presupuesto.requerimiento.detalle.map((linea) => {
    const precioUnitario = precioPorArticulo.get(linea.articuloId);
    if (precioUnitario === undefined) {
      throw new ErrorDeNegocio(
        `El presupuesto no tiene precio cargado para el artículo ${linea.articuloId}.`,
        409
      );
    }
    return { articuloId: linea.articuloId, cantidad: linea.cantidadSolicitada, precioUnitario };
  });

  const montoTotal = lineasOC.reduce(
    (acc, l) => acc + Number(l.cantidad) * Number(l.precioUnitario),
    0
  );
  const flete = presupuesto.costoFlete ?? null;

  const oc = await prisma.$transaction(
    async (tx) => {
      const creada = await crearConNumeroSecuencial(tx, "ordenCompra", {
        prefijo: "OC",
        pad: 5,
        data: {
          proveedorId: presupuesto.proveedorId,
          presupuestoId: presupuesto.id,
          depositoId: presupuesto.requerimiento.depositoId,
          estado: "Pendiente",
          montoTotal,
          flete,
        },
      });

      await tx.ordenCompraDetalle.createMany({
        data: lineasOC.map((l) => ({
          ordenCompraId: creada.id,
          articuloId: l.articuloId,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
        })),
      });

      await tx.ordenCompraLog.create({
        data: {
          ordenCompraId: creada.id,
          usuario: usuario || "sistema",
          accion: "Orden generada desde presupuesto adjudicado",
        },
      });

      return creada;
    },
    { timeout: 30000, maxWait: 15000 }
  );

  return obtenerOCPorId(oc.id);
}

// ---------------------------------------------------------------------------
// Listado y ficha
// ---------------------------------------------------------------------------

async function listarOCs({ estado, proveedorId, desde, hasta, page = 1, pageSize = 20 } = {}) {
  const where = {};
  if (estado) where.estado = estado;
  if (proveedorId) where.proveedorId = Number(proveedorId);
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }

  const skip = (Number(page) - 1) * Number(pageSize);

  const [items, total] = await Promise.all([
    prisma.ordenCompra.findMany({
      where,
      include: { proveedor: true },
      orderBy: { fecha: "desc" },
      skip,
      take: Number(pageSize),
    }),
    prisma.ordenCompra.count({ where }),
  ]);

  return {
    items,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.max(1, Math.ceil(total / Number(pageSize))),
  };
}

async function obtenerOCPorId(id) {
  const ocId = Number(id);
  if (!Number.isInteger(ocId)) {
    throw new ErrorDeNegocio("id inválido.");
  }
  const oc = await prisma.ordenCompra.findUnique({
    where: { id: ocId },
    include: {
      proveedor: true,
      detalle: { include: { articulo: true } },
      log: { orderBy: { fecha: "asc" } }, // el campo en el schema es "log", no "logs"
    },
  });
  if (!oc) {
    throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  }
  return { ...oc, requiereAprobacion: requiereAprobacion(oc.montoTotal, oc.flete) };
}

// ---------------------------------------------------------------------------
// HU-23/24 · Aprobar / Enviar
// ---------------------------------------------------------------------------

async function aprobarOC(id, usuario) {
  const ocId = Number(id);
  const oc = await prisma.ordenCompra.findUnique({ where: { id: ocId } });
  if (!oc) throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  if (oc.estado !== "Pendiente") {
    throw new ErrorDeNegocio("Solo se puede aprobar una orden en estado Pendiente.", 409);
  }
  if (!requiereAprobacion(oc.montoTotal, oc.flete)) {
    throw new ErrorDeNegocio("Esta orden no supera el límite de aprobación automática.", 409);
  }

  return prisma.$transaction(
    async (tx) => {
      const actualizada = await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: "Aprobada" },
      });
      await tx.ordenCompraLog.create({
        data: { ordenCompraId: oc.id, usuario: usuario || "gerente", accion: "Orden aprobada" },
      });
      return actualizada;
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

async function enviarOC(id, usuario) {
  const ocId = Number(id);
  const oc = await prisma.ordenCompra.findUnique({ where: { id: ocId } });
  if (!oc) throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);

  const necesitaAprobacion = requiereAprobacion(oc.montoTotal, oc.flete);
  const puedeEnviarse = oc.estado === "Aprobada" || (oc.estado === "Pendiente" && !necesitaAprobacion);

  if (!puedeEnviarse) {
    throw new ErrorDeNegocio(
      necesitaAprobacion
        ? "Esta orden supera el límite de aprobación y todavía no fue aprobada por un gerente."
        : "La orden no está en un estado válido para ser enviada.",
      409
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const actualizada = await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: "Enviada" },
      });
      await tx.ordenCompraLog.create({
        data: { ordenCompraId: oc.id, usuario: usuario || "compras", accion: "Orden enviada al proveedor" },
      });
      return actualizada;
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

// ---------------------------------------------------------------------------
// HU-25 · Anular
// ---------------------------------------------------------------------------

async function anularOC(id, motivo, usuario) {
  const ocId = Number(id);
  const oc = await prisma.ordenCompra.findUnique({ where: { id: ocId } });
  if (!oc) throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  if (["Recibida", "Recibida con diferencia", "Anulada", "Cerrada"].includes(oc.estado)) {
    throw new ErrorDeNegocio("No se puede anular una orden ya recibida, anulada o cerrada.", 409);
  }

  const movimientoDeEntrada = await prisma.movimientoStock.findFirst({
    where: { ordenCompraId: oc.id },
  });
  if (movimientoDeEntrada) {
    throw new ErrorDeNegocio("La orden ya generó un movimiento de stock de entrada y no puede anularse.", 409);
  }

  return prisma.$transaction(
    async (tx) => {
      const actualizada = await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: "Anulada", motivoAnulacion: motivo },
      });
      await tx.ordenCompraLog.create({
        data: { ordenCompraId: oc.id, usuario: usuario || "compras", accion: `Orden anulada: ${motivo}` },
      });
      return actualizada;
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

// ---------------------------------------------------------------------------
// HU-85 · Recepción — toca Depósito y Stock
// ---------------------------------------------------------------------------

async function registrarRecepcion(id, detalleRecibido, usuario) {
  const ocId = Number(id);
  const oc = await prisma.ordenCompra.findUnique({
    where: { id: ocId },
    include: { detalle: true },
  });
  if (!oc) throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  if (oc.estado !== "Enviada") {
    throw new ErrorDeNegocio("Solo se puede registrar recepción de una orden en estado Enviada.", 409);
  }

  const articuloIds = detalleRecibido.map((l) => Number(l.articuloId));
  if (new Set(articuloIds).size !== articuloIds.length) {
    throw new ErrorDeNegocio("No se puede repetir el mismo artículo dos veces en el detalle.");
  }

  const detallePorArticulo = new Map(oc.detalle.map((d) => [d.articuloId, d]));

  // 1) Validar TODO antes de tocar la base: si una línea se pasa, no se
  // guarda nada (ni siquiera dentro de la transacción se llega a intentar).
  for (const linea of detalleRecibido) {
    const original = detallePorArticulo.get(Number(linea.articuloId));
    if (!original) {
      throw new ErrorDeNegocio(`El artículo ${linea.articuloId} no pertenece a esta orden de compra.`);
    }
    const cantidadRecibida = Number(linea.cantidadRecibida);
    if (!Number.isFinite(cantidadRecibida) || cantidadRecibida < 0) {
      throw new ErrorDeNegocio(`Cantidad inválida para el artículo ${linea.articuloId}.`);
    }
    if (cantidadRecibida > Number(original.cantidad)) {
      throw new ErrorDeNegocio(`La cantidad recibida del artículo ${linea.articuloId} supera lo solicitado.`);
    }
  }

  // 2) Tipo de movimiento (sembrado por seed-tipos-movimiento.js: tipo "E",
  // contexto "NORMAL" — confirmado contra backend/scripts/seed-tipos-movimiento.js).
  const tipoEntradaPorCompra = await prisma.tipoMovimientoStock.findFirst({
    where: { descripcion: "Entrada por Compra", activo: true },
  });
  if (!tipoEntradaPorCompra) {
    throw new ErrorDeNegocio(
      'No se encontró el tipo de movimiento "Entrada por Compra" activo; correr seed-tipos-movimiento.js.',
      500
    );
  }

  // 3) Habilitación Artículo-Depósito (mismo chequeo que registrarEntrada en
  // movimientosStock.servicio.js — no sumar stock a un artículo no habilitado).
  const habilitaciones = await prisma.articuloDeposito.findMany({
    where: { depositoId: oc.depositoId, articuloId: { in: articuloIds }, activo: true },
    include: { articulo: true },
  });
  const habilitacionPorArticulo = Object.fromEntries(habilitaciones.map((h) => [h.articuloId, h]));
  const noHabilitados = articuloIds.filter((aid) => !habilitacionPorArticulo[aid]);
  if (noHabilitados.length > 0) {
    throw new ErrorDeNegocio(
      `Los artículos [${noHabilitados.join(", ")}] no están habilitados en el depósito de esta orden.`
    );
  }

  const huboDiferencia = detalleRecibido.some((linea) => {
    const original = detallePorArticulo.get(Number(linea.articuloId));
    return Number(linea.cantidadRecibida) < Number(original.cantidad);
  });
  const estadoFinalOC = huboDiferencia ? "Recibida con diferencia" : "Recibida";

  return prisma.$transaction(
    async (tx) => {
      // Actualizar cantidadRecibida en cada línea de la OC
      for (const linea of detalleRecibido) {
        await tx.ordenCompraDetalle.update({
          where: {
            ordenCompraId_articuloId: { ordenCompraId: oc.id, articuloId: Number(linea.articuloId) },
          },
          data: { cantidadRecibida: linea.cantidadRecibida },
        });
      }

      // Movimiento de Entrada por Compra
      const movimiento = await tx.movimientoStock.create({
        data: {
          depositoId: oc.depositoId,
          tipoMovStockId: tipoEntradaPorCompra.id,
          ordenCompraId: oc.id,
          detalle: `Recepción de ${oc.numero}`,
          usuario: usuario || null,
          // estado queda en su default "Confirmado": a diferencia de una
          // transferencia, la recepción de una OC es un solo paso — la
          // diferencia (si la hay) se refleja en OrdenCompra.estado, no acá.
        },
      });

      // Detalle del movimiento + suma de stock, solo por lo efectivamente recibido
      for (const linea of detalleRecibido) {
        const cantidadRecibida = Number(linea.cantidadRecibida);
        if (cantidadRecibida === 0) continue;

        await tx.movimientoStockDetalle.create({
          data: { movStockId: movimiento.id, articuloId: Number(linea.articuloId), cantidad: cantidadRecibida },
        });

        const habilitacion = habilitacionPorArticulo[Number(linea.articuloId)];
        await tx.articuloDepositoStock.upsert({
          where: { articuloDepositoId: habilitacion.id },
          create: { articuloDepositoId: habilitacion.id, stockActual: cantidadRecibida },
          update: { stockActual: { increment: cantidadRecibida } },
        });
      }

      const ocActualizada = await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: estadoFinalOC },
      });

      await tx.ordenCompraLog.create({
        data: {
          ordenCompraId: oc.id,
          usuario: usuario || "deposito",
          accion: `Recepción registrada — ${estadoFinalOC}`,
        },
      });

      return ocActualizada;
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

module.exports = {
  generarOC,
  listarOCs,
  obtenerOCPorId,
  aprobarOC,
  enviarOC,
  anularOC,
  registrarRecepcion,
  requiereAprobacion,
  ErrorDeNegocio,
};