// src/modulos/depositos/depositos.servicio.js
//
// Lógica de negocio pura (HU-3: Depósitos). No sabe nada de HTTP/Express.

const prisma = require("../../lib/prisma");

async function crearDeposito({ nombre, ubicacion, responsable }) {
  return prisma.deposito.create({ data: { nombre, ubicacion, responsable } });
}

async function listarDepositos() {
  return prisma.deposito.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });
}

async function obtenerDepositoPorId(id) {
  return prisma.deposito.findUnique({ where: { id } });
}

module.exports = { crearDeposito, listarDepositos, obtenerDepositoPorId };
