// src/modulos/articulos/articulos.servicio.js

const prisma = require("../../lib/prisma");

async function crearArticulo({ codigo, descripcion, unidadMedida, categoria }) {
  return prisma.articulo.create({
    data: { codigo, descripcion, unidadMedida, categoria },
  });
}

async function listarArticulos({ q, categoria, unidadMedida, page = 1, pageSize = 10 } = {}) {
  const where = {
    activo: true,
    ...(categoria ? { categoria } : {}),
    ...(unidadMedida ? { unidadMedida } : {}),
    ...(q
      ? {
          OR: [{ codigo: { contains: q } }, { descripcion: { contains: q } }],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.articulo.findMany({
      where,
      orderBy: { codigo: "asc" },
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
