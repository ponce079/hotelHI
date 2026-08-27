// src/modulos/articulo-deposito/articulo-deposito.servicio.js

const prisma = require("../../lib/prisma");

// Upsert en vez de create: si el par ya existia pero estaba deshabilitado
// (baja logica via cambiarEstadoHabilitacion), "habilitar" lo reactiva en
// vez de chocar con la unique constraint y no hacer nada.
async function habilitarArticuloEnDeposito({ articuloId, depositoId }) {
  return prisma.articuloDeposito.upsert({
    where: { articuloId_depositoId: { articuloId, depositoId } },
    update: { activo: true },
    create: { articuloId, depositoId },
  });
}

async function buscarHabilitacion(articuloId, depositoId) {
  return prisma.articuloDeposito.findUnique({ where: { articuloId_depositoId: { articuloId, depositoId } } });
}

async function listarHabilitaciones() {
  return prisma.articuloDeposito.findMany({
    include: { articulo: true, deposito: true },
    orderBy: { id: "asc" },
  });
}

async function obtenerDepositoPorId(id) {
  return prisma.deposito.findUnique({ where: { id } });
}

async function obtenerHabilitacionPorId(id) {
  return prisma.articuloDeposito.findUnique({
    where: { id },
    include: { articulo: true, deposito: true, stock: true },
  });
}

async function cambiarEstadoHabilitacion(id, activo) {
  return prisma.articuloDeposito.update({
    where: { id },
    data: { activo },
    include: { articulo: true, deposito: true, stock: true },
  });
}

module.exports = {
  habilitarArticuloEnDeposito,
  buscarHabilitacion,
  listarHabilitaciones,
  obtenerDepositoPorId,
  obtenerHabilitacionPorId,
  cambiarEstadoHabilitacion,
};
