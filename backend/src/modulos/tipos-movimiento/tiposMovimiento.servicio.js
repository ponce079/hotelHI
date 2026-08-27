// src/modulos/tipos-movimiento/tiposMovimiento.servicio.js
//
// Lógica de negocio pura (HU-10: Tipos de Movimiento de Stock).

const prisma = require("../../lib/prisma");

async function crearTipoMovimiento({ descripcion, tipo }) {
  return prisma.tipoMovimientoStock.create({ data: { descripcion, tipo } });
}

async function listarTiposMovimiento() {
  return prisma.tipoMovimientoStock.findMany({
    where: { activo: true },
    orderBy: { descripcion: "asc" },
  });
}

async function obtenerTipoMovimientoPorId(id) {
  return prisma.tipoMovimientoStock.findUnique({ where: { id } });
}

async function cambiarEstadoTipoMovimiento(id, activo) {
  return prisma.tipoMovimientoStock.update({ where: { id }, data: { activo } });
}

module.exports = {
  crearTipoMovimiento,
  listarTiposMovimiento,
  obtenerTipoMovimientoPorId,
  cambiarEstadoTipoMovimiento,
};
