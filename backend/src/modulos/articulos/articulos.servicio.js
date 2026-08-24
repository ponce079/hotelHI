// src/modulos/articulos/articulos.servicio.js

const prisma = require("../../lib/prisma");

// El codigo se genera solo (ART-0001, correlativo por id) recien despues del
// alta, porque el id autoincrement no se conoce hasta que el insert termina.
async function crearArticulo({ nombre, unidadMedida, categoria }) {
  return prisma.$transaction(async (tx) => {
    const creado = await tx.articulo.create({ data: { nombre, unidadMedida, categoria } });
    return tx.articulo.update({
      where: { id: creado.id },
      data: { codigo: `ART-${String(creado.id).padStart(4, "0")}` },
    });
  });
}

async function actualizarArticulo(id, { nombre, unidadMedida, categoria }) {
  return prisma.articulo.update({
    where: { id },
    data: { nombre, unidadMedida, categoria },
  });
}

async function cambiarEstadoArticulo(id, activo) {
  return prisma.articulo.update({ where: { id }, data: { activo } });
}

async function listarArticulos({ q, categoria, unidadMedida, estado, page = 1, pageSize = 10 } = {}) {
  const where = {
    ...(estado === "todos" ? {} : { activo: estado !== "inactivo" }),
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

module.exports = {
  crearArticulo,
  actualizarArticulo,
  cambiarEstadoArticulo,
  listarArticulos,
  obtenerArticuloPorId,
};
