// routes/movimientosStock.routes.js
// HU-12 (Ricardo) — Movimiento de Entrada de stock
//
// Reglas de negocio (Criterios de Aceptación de la HU):
// - El movimiento se registra con UN solo depósito.
// - El tipo de movimiento elegido debe tener tipo = 'E' (Entrada).
// - El alta del movimiento y la actualización del stock son atómicas
//   (si algo falla, no queda nada a medio guardar).
// - No se permite repetir el mismo artículo dos veces en el detalle
//   de un mismo movimiento (HU-15, la comparte con Agus).

const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

/**
 * POST /api/movimientos-stock/entrada
 * body: {
 *   depositoId: number,
 *   tipoMovStockId: number,
 *   detalle?: string,          // observación/motivo del movimiento
 *   usuario?: string,
 *   items: [{ articuloId: number, cantidad: number }, ...]
 * }
 */
router.post("/entrada", async (req, res) => {
  const { depositoId, tipoMovStockId, detalle, usuario, items } = req.body;

  // --- Validaciones básicas de payload ---
  if (!depositoId || !tipoMovStockId) {
    return res.status(400).json({ error: "depositoId y tipoMovStockId son obligatorios." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Debe incluir al menos un artículo en 'items'." });
  }
  const articuloIds = items.map((i) => i.articuloId);
  const hayDuplicados = new Set(articuloIds).size !== articuloIds.length;
  if (hayDuplicados) {
    return res.status(400).json({ error: "No se puede repetir el mismo artículo dos veces en el detalle." });
  }
  if (items.some((i) => !i.articuloId || !(Number(i.cantidad) > 0))) {
    return res.status(400).json({ error: "Cada ítem necesita articuloId y una cantidad mayor a 0." });
  }

  try {
    // --- Validar que el tipo de movimiento exista y sea de tipo Entrada ---
    const tipoMov = await prisma.tipoMovimientoStock.findUnique({ where: { id: Number(tipoMovStockId) } });
    if (!tipoMov || !tipoMov.activo) {
      return res.status(400).json({ error: "El tipo de movimiento indicado no existe o está inactivo." });
    }
    if (tipoMov.tipo !== "E") {
      return res.status(400).json({ error: `El tipo de movimiento '${tipoMov.descripcion}' no es de Entrada (tipo='E').` });
    }

    // --- Validar que el depósito exista y esté activo ---
    const deposito = await prisma.deposito.findUnique({ where: { id: Number(depositoId) } });
    if (!deposito || !deposito.activo) {
      return res.status(400).json({ error: "El depósito indicado no existe o está inactivo." });
    }

    // --- Validar que cada artículo esté habilitado en ese depósito (HU-4) ---
    const habilitaciones = await prisma.articuloDeposito.findMany({
      where: { depositoId: Number(depositoId), articuloId: { in: articuloIds }, activo: true },
    });
    const habilitadosIds = new Set(habilitaciones.map((h) => h.articuloId));
    const noHabilitados = articuloIds.filter((id) => !habilitadosIds.has(id));
    if (noHabilitados.length > 0) {
      return res.status(400).json({
        error: `Los artículos [${noHabilitados.join(", ")}] no están habilitados en este depósito. Habilitalos primero (HU-4).`,
      });
    }
    const habilitacionPorArticulo = Object.fromEntries(habilitaciones.map((h) => [h.articuloId, h]));

    // --- Transacción atómica: alta del movimiento + detalle + actualización de stock ---
    const resultado = await prisma.$transaction(async (tx) => {
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

        await tx.movimientoStockDetalle.create({
          data: {
            movStockId: movimiento.id,
            articuloId: item.articuloId,
            cantidad,
          },
        });

        // Upsert del stock: si todavía no existe la fila de stock para este
        // par artículo-depósito, se crea con la cantidad entrante; si ya
        // existe, se incrementa de forma atómica.
        await tx.articuloDepositoStock.upsert({
          where: { articuloDepositoId },
          create: {
            articuloDepositoId,
            stockActual: cantidad,
          },
          update: {
            stockActual: { increment: cantidad },
          },
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
    }, {
      // Base gratuita (Clever Cloud) puede tener más latencia que una local:
      // subimos el límite por defecto (5s) para que no corte una transacción
      // válida que solo tardó un poco más de la cuenta.
      timeout: 15000, // máximo que puede durar la transacción en sí
      maxWait: 10000, // máximo que puede esperar para arrancarla
    });

    return res.status(201).json(resultado);
  } catch (err) {
    console.error("Error al registrar movimiento de Entrada:", err);
    return res.status(500).json({ error: "No se pudo registrar el movimiento de Entrada." });
  }
});

module.exports = router;