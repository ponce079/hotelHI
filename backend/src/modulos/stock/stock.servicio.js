// src/modulos/stock/stock.servicio.js
// Lógica de negocio pura (HU-6: Consulta de Stock).

const prisma = require("../../lib/prisma");

async function consultarStock({ articuloId, categoria, depositoId }) {
  const habilitaciones = await prisma.articuloDeposito.findMany({
    where: {
      activo: true,
      ...(articuloId ? { articuloId: Number(articuloId) } : {}),
      ...(depositoId ? { depositoId: Number(depositoId) } : {}),
      ...(categoria ? { articulo: { categoria: String(categoria) } } : {}),
    },
    include: { articulo: true, deposito: true, stock: true },
    orderBy: [{ deposito: { nombre: "asc" } }, { articulo: { codigo: "asc" } }],
  });

  // Si un artículo-depósito todavía no tuvo ningún movimiento de Entrada,
  // no existe fila en ArticuloDepositoStock — se muestra igual, con stock 0.
  return habilitaciones.map((h) => ({
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
}

module.exports = { consultarStock };