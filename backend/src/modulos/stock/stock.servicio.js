// src/modulos/stock/stock.servicio.js
// Lógica de negocio pura (HU-6: Consulta de Stock).
//
// NOTA: el modelo Articulo cambió — ya no tiene "codigo" ni "descripcion"
// por separado, ahora es un solo campo "nombre" (único).

const prisma = require("../../lib/prisma");

async function consultarStock({ articuloId, categoria, depositoId, incluirInactivos }) {
  // Por defecto solo trae habilitaciones activas (HU-6, lo que ya usaban
  // StockLista y ArticuloDetalleModal). incluirInactivos=true lo usa el
  // detalle de deposito (HU-4/5), que necesita ver tambien lo deshabilitado
  // para poder mostrar el boton "Rehabilitar" en la misma fila.
  const soloActivos = !(incluirInactivos === "true" || incluirInactivos === true);
  const habilitaciones = await prisma.articuloDeposito.findMany({
    where: {
      ...(soloActivos ? { activo: true } : {}),
      ...(articuloId ? { articuloId: Number(articuloId) } : {}),
      ...(depositoId ? { depositoId: Number(depositoId) } : {}),
      ...(categoria ? { articulo: { categoria: String(categoria) } } : {}),
    },
    include: { articulo: true, deposito: true, stock: true },
    orderBy: [{ deposito: { nombre: "asc" } }, { articulo: { nombre: "asc" } }],
  });

  return habilitaciones.map((h) => ({
    articuloDepositoId: h.id,
    articuloId: h.articulo.id,
    nombre: h.articulo.nombre,
    categoria: h.articulo.categoria,
    unidadMedida: h.articulo.unidadMedida,
    depositoCentralId: h.articulo.depositoCentralId,
    depositoId: h.deposito.id,
    deposito: h.deposito.nombre,
    activo: h.activo,
    stockActual: h.stock ? h.stock.stockActual : 0,
    stockMinimo: h.stock ? h.stock.stockMinimo : 0,
    stockMaximo: h.stock ? h.stock.stockMaximo : null,
  }));
}

// HU-7: parametros de reposicion. Usa upsert porque la fila de stock recien
// se crea con el primer movimiento (registrarEntrada/Salida) — habilitar un
// articulo en un deposito no crea ArticuloDepositoStock todavia.
async function actualizarParametrosStock(articuloDepositoId, { stockMinimo, stockMaximo }) {
  return prisma.articuloDepositoStock.upsert({
    where: { articuloDepositoId },
    update: { stockMinimo, stockMaximo },
    create: { articuloDepositoId, stockMinimo, stockMaximo, stockActual: 0 },
  });
}

module.exports = { consultarStock, actualizarParametrosStock };