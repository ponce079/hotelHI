// routes/stock.routes.js
// HU-6 (Ricardo) — Consulta de Stock actual por artículo y depósito
//
// Criterios de Aceptación:
// - Permite filtrar por artículo, categoría y depósito.
// - El stock mostrado sale de ArticuloDepositoStock (separado de la
//   habilitación ArticuloDeposito).
// - Tiene que reflejar lo último que dejó cada movimiento de Entrada/Salida.

const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

/**
 * GET /api/stock
 * query params opcionales: articuloId, categoria, depositoId
 */
router.get("/", async (req, res) => {
  const { articuloId, categoria, depositoId } = req.query;

  try {
    const habilitaciones = await prisma.articuloDeposito.findMany({
      where: {
        activo: true,
        ...(articuloId ? { articuloId: Number(articuloId) } : {}),
        ...(depositoId ? { depositoId: Number(depositoId) } : {}),
        ...(categoria ? { articulo: { categoria: String(categoria) } } : {}),
      },
      include: {
        articulo: true,
        deposito: true,
        stock: true,
      },
      orderBy: [{ deposito: { nombre: "asc" } }, { articulo: { codigo: "asc" } }],
    });

    // Si un artículo-depósito todavía no tuvo ningún movimiento de Entrada,
    // no existe fila en ArticuloDepositoStock todavía — lo mostramos igual,
    // con stock 0, en vez de omitirlo de la respuesta.
    const resultado = habilitaciones.map((h) => ({
      articuloId: h.articulo.id,
      codigo: h.articulo.codigo,
      descripcion: h.articulo.descripcion,
      categoria: h.articulo.categoria,
      unidadMedida: h.articulo.unidadMedida,
      depositoId: h.deposito.id,
      deposito: h.deposito.nombre,
      stockActual: h.stock ? h.stock.stockActual : 0,
      stockMinimo: h.stock ? h.stock.stockMinimo : 0,
      stockMaximo: h.stock ? h.stock.stockMaximo : null,
    }));

    return res.json(resultado);
  } catch (err) {
    console.error("Error al consultar stock:", err);
    return res.status(500).json({ error: "No se pudo consultar el stock." });
  }
});

module.exports = router;