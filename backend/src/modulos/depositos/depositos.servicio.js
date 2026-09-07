// src/modulos/depositos/depositos.servicio.js
//
// Lógica de negocio pura (HU-3: Depósitos). No sabe nada de HTTP/Express.

const prisma = require("../../lib/prisma");

async function crearDeposito({ nombre, ubicacion, responsable, esCentral }) {
  return prisma.deposito.create({ data: { nombre, ubicacion, responsable, esCentral } });
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

async function actualizarDeposito(id, { nombre, ubicacion, responsable, esCentral }) {
  return prisma.deposito.update({ where: { id }, data: { nombre, ubicacion, responsable, esCentral } });
}

// Sprint 3 — Transferencia a Central: no hay un límite duro de depósitos
// centrales (lo decide el ABM), pero el diseño espera 1 o 2. Sirve para que
// el frontend avise en vez de bloquear si ya hay otros marcados.
async function contarCentrales(excluirId) {
  return prisma.deposito.count({
    where: { esCentral: true, activo: true, ...(excluirId ? { id: { not: excluirId } } : {}) },
  });
}

module.exports = { crearDeposito, listarDepositos, obtenerDepositoPorId, actualizarDeposito, contarCentrales };
