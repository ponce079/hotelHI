// src/modulos/articulos/articulos.servicio.js

const prisma = require("../../lib/prisma");

async function crearArticulo({ codigo, descripcion, unidadMedida, categoria }) {
  return prisma.articulo.create({
    data: { codigo, descripcion, unidadMedida, categoria },
  });
}

async function listarArticulos() {
  return prisma.articulo.findMany({
    where: { activo: true },
    orderBy: { codigo: "asc" },
  });
}

async function obtenerArticuloPorId(id) {
  return prisma.articulo.findUnique({ where: { id } });
}

module.exports = { crearArticulo, listarArticulos, obtenerArticuloPorId };
