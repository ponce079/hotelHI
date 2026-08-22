// src/modulos/articulos/articulos.servicio.js

const prisma = require("../../lib/prisma");

async function crearArticulo({ nombre, unidadMedida, categoria }) {
  return prisma.articulo.create({
    data: { nombre, unidadMedida, categoria },
  });
}

async function listarArticulos({ q, categoria, unidadMedida, page = 1, pageSize = 10 } = {}) {
  const where = {
    activo: true,
    ...(categoria ? { categoria } : {}),
    ...(unidadMedida ? { unidadMedida } : {}),
    ...(q ? { nombre: { contains: q } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.articulo.findMany({
      where,
      orderBy: { nombre: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.articulo.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function obtenerArticuloPorId(id) {
  return prisma.articulo.findUnique({ where: { id } });
}

module.exports = { crearArticulo, listarArticulos, obtenerArticuloPorId };
