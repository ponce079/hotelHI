// src/modulos/proveedores/proveedores.servicio.js
//
// HU-18 a 21 — catálogo de proveedores. Es la primera pieza del circuito
// de compras: Requerimientos, Presupuestos, Órdenes de Compra,
// Comprobantes y Pagos dependen de que exista un proveedor.

const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");

// Mismo patrón que cuentaCorriente.servicio.js: el servicio tira un error
// con statusCode y el controlador lo traduce a una respuesta HTTP. No hay
// middleware global de errores en este proyecto (convención de Sprint 1).
class ErrorDeNegocio extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ErrorDeNegocio";
    this.statusCode = statusCode;
  }
}

const INCLUDE_RUBROS = { rubros: { orderBy: { rubro: "asc" } } };

// Los rubros viven en su propia tabla (ProveedorRubro), así que un alta o
// una edición tocan 2 tablas -> transacción, siempre. En la edición se
// reemplaza el set completo: se borran los que ya no están y se crean los
// nuevos, en vez de intentar un diff fino que no aporta nada acá.
async function crearProveedor({ rubros, ...datos }) {
  // Adentro de la transacción, solo las escrituras que tienen que ser
  // atómicas; la relectura con include va después del commit, porque
  // contra la base compartida cada consulta extra suma latencia y hace
  // saltar el timeout (ver OPCIONES_TRANSACCION en lib/constantes.js).
  const creado = await prisma.$transaction(async (tx) => {
    const proveedor = await tx.proveedor.create({ data: datos });
    await tx.proveedorRubro.createMany({
      data: rubros.map((rubro) => ({ proveedorId: proveedor.id, rubro })),
    });
    return proveedor;
  }, OPCIONES_TRANSACCION);

  return prisma.proveedor.findUnique({ where: { id: creado.id }, include: INCLUDE_RUBROS });
}

async function actualizarProveedor(id, { rubros, ...datos }) {
  const existente = await prisma.proveedor.findUnique({ where: { id } });
  if (!existente) throw new ErrorDeNegocio("Proveedor no encontrado", 404);

  // HU-19: el CUIT queda congelado en cuanto el proveedor tiene una orden
  // de compra emitida — es el dato fiscal con el que ya se operó, cambiarlo
  // dejaría comprobantes viejos apuntando a un CUIT que nunca existió.
  if (datos.cuit !== existente.cuit) {
    const conOrdenes = await prisma.ordenCompra.count({ where: { proveedorId: id } });
    if (conOrdenes > 0) {
      throw new ErrorDeNegocio(
        `No se puede cambiar el CUIT: el proveedor ya tiene ${conOrdenes} orden${conOrdenes > 1 ? "es" : ""} de compra asociada${conOrdenes > 1 ? "s" : ""}.`,
        409
      );
    }
  }

  // Los rubros que ya tiene se leen ANTES de abrir la transacción: es una
  // lectura, no hace falta que esté adentro del commit.
  const actuales = await prisma.proveedorRubro.findMany({ where: { proveedorId: id } });
  const yaEstan = actuales.map((r) => r.rubro);
  const faltantes = rubros.filter((r) => !yaEstan.includes(r));

  await prisma.$transaction(async (tx) => {
    await tx.proveedor.update({ where: { id }, data: datos });
    await tx.proveedorRubro.deleteMany({ where: { proveedorId: id, rubro: { notIn: rubros } } });
    if (faltantes.length > 0) {
      await tx.proveedorRubro.createMany({
        data: faltantes.map((rubro) => ({ proveedorId: id, rubro })),
      });
    }
  }, OPCIONES_TRANSACCION);

  return prisma.proveedor.findUnique({ where: { id }, include: INCLUDE_RUBROS });
}

// Baja lógica siempre (HU-19). Un proveedor inactivo no aparece para
// invitar a cotizar ni en altas nuevas, pero conserva su historial: sus
// órdenes de compra, comprobantes y cuenta corriente siguen consultables.
async function cambiarEstadoProveedor(id, activo) {
  const existente = await prisma.proveedor.findUnique({ where: { id } });
  if (!existente) throw new ErrorDeNegocio("Proveedor no encontrado", 404);
  return prisma.proveedor.update({ where: { id }, data: { activo }, include: INCLUDE_RUBROS });
}

// HU-20: filtros combinados + búsqueda por razón social o CUIT. Por
// defecto solo activos — "todos" hay que pedirlo explícito.
async function listarProveedores({ q, rubro, condicionComercial, estado, page = 1, pageSize = 10 } = {}) {
  const where = {
    ...(estado === "todos" ? {} : { activo: estado !== "inactivo" }),
    ...(condicionComercial ? { condicionComercial } : {}),
    ...(rubro ? { rubros: { some: { rubro } } } : {}),
    ...(q ? { OR: [{ razonSocial: { contains: q } }, { cuit: { contains: q } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.proveedor.findMany({
      where,
      include: INCLUDE_RUBROS,
      orderBy: [{ activo: "desc" }, { razonSocial: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.proveedor.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function obtenerProveedorPorId(id) {
  return prisma.proveedor.findUnique({ where: { id }, include: INCLUDE_RUBROS });
}

// Listado plano para los selects/grillas de otras pantallas (invitar a
// cotizar, filtro de comprobantes). Sin paginar y solo activos, que es lo
// que necesita un combo — el listado con filtros es listarProveedores.
async function listarProveedoresActivos({ rubro } = {}) {
  return prisma.proveedor.findMany({
    where: { activo: true, ...(rubro ? { rubros: { some: { rubro } } } : {}) },
    include: INCLUDE_RUBROS,
    orderBy: { razonSocial: "asc" },
  });
}

// HU-21: historial de órdenes de compra del proveedor, ordenable por
// fecha o por monto. El total excluye las anuladas — una OC anulada no
// es plata que se le compró a ese proveedor.
async function listarOrdenesCompraDeProveedor(id, { sort = "fecha" } = {}) {
  const proveedor = await prisma.proveedor.findUnique({ where: { id } });
  if (!proveedor) throw new ErrorDeNegocio("Proveedor no encontrado", 404);

  const orderBy = sort === "monto" ? { montoTotal: "desc" } : { fecha: "desc" };
  const ordenes = await prisma.ordenCompra.findMany({
    where: { proveedorId: id },
    orderBy,
    include: { deposito: { select: { id: true, nombre: true } } },
  });

  const totalComprado = ordenes
    .filter((oc) => oc.estado !== "Anulada")
    .reduce((acc, oc) => acc + Number(oc.montoTotal) + Number(oc.flete ?? 0), 0);

  return { items: ordenes, total: ordenes.length, totalComprado: Math.round(totalComprado * 100) / 100 };
}

module.exports = {
  ErrorDeNegocio,
  crearProveedor,
  actualizarProveedor,
  cambiarEstadoProveedor,
  listarProveedores,
  listarProveedoresActivos,
  obtenerProveedorPorId,
  listarOrdenesCompraDeProveedor,
};
