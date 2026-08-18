import { prisma } from "../../lib/prisma.js";

export function crearArticulo({ codigo, descripcion, unidadMedida, categoria }) {
  return prisma.articulo.create({
    data: { codigo, descripcion, unidadMedida, categoria },
  });
}

export function listarArticulos() {
  return prisma.articulo.findMany({
    where: { activo: true },
    orderBy: { codigo: "asc" },
  });
}

export function obtenerArticuloPorId(id) {
  return prisma.articulo.findUnique({ where: { id } });
}
