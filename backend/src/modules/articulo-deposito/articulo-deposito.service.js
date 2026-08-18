import { prisma } from "../../lib/prisma.js";

export function habilitarArticuloEnDeposito({ articuloId, depositoId }) {
  return prisma.articuloDeposito.create({
    data: { articuloId, depositoId },
  });
}

export function listarHabilitaciones() {
  return prisma.articuloDeposito.findMany({
    include: { articulo: true, deposito: true },
    orderBy: { id: "asc" },
  });
}

export function obtenerDepositoPorId(id) {
  return prisma.deposito.findUnique({ where: { id } });
}
