// src/modulos/movimientos-salida/movimientoSalida.servicio.js
//
// Lógica de negocio pura (HU-13: Movimiento de Salida). Mismo patrón que
// movimientos-stock/movimientosStock.servicio.js (HU-12, Entrada): no sabe
// nada de HTTP/Express, tira errores con "statusCode" para que el
// controlador decida cómo responder.
//
// NOTA: ErrorDeNegocio está duplicada a propósito acá (existe otra copia
// en movimientosStock.servicio.js). Es así para que esta carpeta sea
// autocontenida y no dependa de un módulo de otra persona. Si el equipo
// quiere unificarla más adelante, se puede mover a src/lib/errores.js.

const prisma = require("../../lib/prisma");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

async function registrarSalida({ depositoId, tipoMovStockId, detalle, usuario, items }) {
  // --- Validaciones básicas de payload ---
  if (!depositoId || !tipoMovStockId) {
    throw new ErrorDeNegocio("depositoId y tipoMovStockId son obligatorios.");
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

  // --- Validar tipo de movimiento (debe ser de Salida) ---
  const tipoMov = await prisma.tipoMovimientoStock.findUnique({ where: { id: Number(tipoMovStockId) } });
  if (!tipoMov || !tipoMov.activo) {
    throw new ErrorDeNegocio("El tipo de movimiento indicado no existe o está inactivo.");
  }
  if (tipoMov.tipo !== "S") {
    throw new ErrorDeNegocio(`El tipo de movimiento '${tipoMov.descripcion}' no es de Salida (tipo='S').`);
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

      for (const item of items) {
        const cantidad = Number(item.cantidad);
        const articuloDepositoId = habilitacionPorArticulo[item.articuloId].id;

        // Chequeo de stock pegado al decrement, dentro de la misma
        // transacción. Reduce (no elimina del todo) la ventana de carrera
        // entre dos salidas simultáneas sobre el mismo artículo — para
        // cerrarla del todo haría falta un update condicional tipo
        // updateMany({ where: { stockActual: { gte: cantidad } } }).
        // Queda como mejora de hardening post-Sprint 1.
        const stock = await tx.articuloDepositoStock.findUnique({ where: { articuloDepositoId } });
        const stockActual = stock ? Number(stock.stockActual) : 0;
        if (stockActual < cantidad) {
          throw new ErrorDeNegocio(
            `Stock insuficiente para el artículo ${item.articuloId}. Actual: ${stockActual}, Solicitado: ${cantidad}.`
          );
        }

        await tx.movimientoStockDetalle.create({
          data: { movStockId: movimiento.id, articuloId: item.articuloId, cantidad },
        });

        await tx.articuloDepositoStock.update({
          where: { articuloDepositoId },
          data: { stockActual: { decrement: cantidad } },
        });
      }

      return tx.movimientoStock.findUnique({
        where: { id: movimiento.id },
        include: {
          deposito: true,
          tipoMovStock: true,
          detalleMovimientos: { include: { articulo: true } },
        },
      });
    },
    { timeout: 15000, maxWait: 10000 }
  );

  return movimientoCreado;
}

module.exports = { registrarSalida, ErrorDeNegocio };
