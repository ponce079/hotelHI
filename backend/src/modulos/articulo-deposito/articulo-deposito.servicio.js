// src/modulos/articulo-deposito/articulo-deposito.servicio.js

const prisma = require("../../lib/prisma");

async function habilitarArticuloEnDeposito({ articuloId, depositoId }) {
  return prisma.articuloDeposito.create({
    data: { articuloId, depositoId },
  });
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
  listarHabilitaciones,
  obtenerDepositoPorId,
  obtenerHabilitacionPorId,
  cambiarEstadoHabilitacion,
};
