// Catálogo de Tipos de Habitación (HU-89) — Etapa 1 de tarifas por
// temporada. Lógica de negocio pura: no conoce HTTP.
//
// Sobre este catálogo se van a colgar las tarifas en las próximas etapas.
// tarifaPorNoche sigue viviendo en Habitacion (precio por habitación
// individual) — este módulo no la toca para nada.

const prisma = require("../../lib/prisma");
const { LIMITES_TIPO_HABITACION, PATRON_CODIGO } = require("./tiposHabitacion.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

function normalizarCodigo(valor) {
  const codigo = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  if (codigo.length < LIMITES_TIPO_HABITACION.codigoMin || codigo.length > LIMITES_TIPO_HABITACION.codigoMax) {
    throw new ErrorDeNegocio(
      `codigo debe tener entre ${LIMITES_TIPO_HABITACION.codigoMin} y ${LIMITES_TIPO_HABITACION.codigoMax} caracteres.`
    );
  }
  if (!PATRON_CODIGO.test(codigo)) {
    throw new ErrorDeNegocio("codigo solo puede tener letras, números y guion (sin espacios).");
  }
  return codigo;
}

function normalizarNombre(valor) {
  const nombre = typeof valor === "string" ? valor.trim() : "";
  if (!nombre) throw new ErrorDeNegocio("nombre es obligatorio.");
  if (nombre.length > LIMITES_TIPO_HABITACION.nombre) {
    throw new ErrorDeNegocio(`nombre no puede superar los ${LIMITES_TIPO_HABITACION.nombre} caracteres.`);
  }
  return nombre;
}

function normalizarDescripcion(valor) {
  const descripcion = typeof valor === "string" ? valor.trim() : "";
  if (!descripcion) return null;
  if (descripcion.length > LIMITES_TIPO_HABITACION.descripcion) {
    throw new ErrorDeNegocio(`descripcion no puede superar los ${LIMITES_TIPO_HABITACION.descripcion} caracteres.`);
  }
  return descripcion;
}

// Unicidad de nombre case-insensitive + trim, verificada en código (no
// delegada al collation de MySQL): la tabla es chica —un catálogo
// maestro—, así que un scan completo no tiene costo real, y esto deja el
// criterio de "duplicado" determinístico sin importar cómo esté
// configurada la base.
function normalizarParaComparar(nombre) {
  return nombre.trim().toLowerCase();
}

async function existeNombreDuplicado(nombre, excluirId = null) {
  const candidatos = await prisma.tipoHabitacion.findMany({ select: { id: true, nombre: true } });
  const buscado = normalizarParaComparar(nombre);
  return candidatos.some((c) => c.id !== excluirId && normalizarParaComparar(c.nombre) === buscado);
}

async function crearTipoHabitacion(data) {
  const codigo = normalizarCodigo(data?.codigo);
  const nombre = normalizarNombre(data?.nombre);
  const descripcion = normalizarDescripcion(data?.descripcion);

  const codigoExistente = await prisma.tipoHabitacion.findUnique({ where: { codigo } });
  if (codigoExistente) throw new ErrorDeNegocio(`Ya existe un tipo de habitación con el código "${codigo}".`, 409);
  if (await existeNombreDuplicado(nombre)) {
    throw new ErrorDeNegocio(`Ya existe un tipo de habitación con el nombre "${nombre}".`, 409);
  }

  try {
    return await prisma.tipoHabitacion.create({ data: { codigo, nombre, descripcion } });
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ErrorDeNegocio("Ya existe un tipo de habitación con ese código o nombre.", 409);
    }
    throw err;
  }
}

// Código y nombre son editables (regla 6); el id nunca se acepta del
// payload — la relación con Habitacion es por id, así que renombrar no
// requiere tocar ninguna habitación.
async function actualizarTipoHabitacion(id, data) {
  const tipoId = Number(id);
  if (!Number.isInteger(tipoId) || tipoId < 1) throw new ErrorDeNegocio("id debe ser un número entero mayor a 0.");
  const existente = await prisma.tipoHabitacion.findUnique({ where: { id: tipoId } });
  if (!existente) throw new ErrorDeNegocio("Tipo de habitación no encontrado.", 404);

  const codigo = normalizarCodigo(data?.codigo);
  const nombre = normalizarNombre(data?.nombre);
  const descripcion = normalizarDescripcion(data?.descripcion);

  const codigoDuplicado = await prisma.tipoHabitacion.findFirst({ where: { codigo, id: { not: tipoId } } });
  if (codigoDuplicado) throw new ErrorDeNegocio(`Ya existe un tipo de habitación con el código "${codigo}".`, 409);
  if (await existeNombreDuplicado(nombre, tipoId)) {
    throw new ErrorDeNegocio(`Ya existe un tipo de habitación con el nombre "${nombre}".`, 409);
  }

  try {
    return await prisma.tipoHabitacion.update({ where: { id: tipoId }, data: { codigo, nombre, descripcion } });
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ErrorDeNegocio("Ya existe un tipo de habitación con ese código o nombre.", 409);
    }
    throw err;
  }
}

function filtroActivoDesdeQuery(activo) {
  if (activo === true || activo === "true") return { activo: true };
  if (activo === false || activo === "false") return { activo: false };
  return {}; // undefined o "todos": sin filtrar (lo usa el ABM, que necesita ver también los dados de baja).
}

// `conHabitacionActiva` (HU-89, web pública de HU-38/40): solo tipos con
// al menos una habitación activa — no tiene sentido ofrecerle al huésped
// un tipo sin ninguna unidad real detrás. Las pantallas internas
// (HabitacionesPage, ReservaWizard de mostrador, CheckInWalkIn) NO lo
// pasan: ven todos los tipos activos del catálogo, tengan o no
// habitaciones cargadas hoy.
async function listarTiposHabitacion({ activo, conHabitacionActiva } = {}) {
  const filtroHabitacionActiva =
    conHabitacionActiva === true || conHabitacionActiva === "true" ? { habitaciones: { some: { activo: true } } } : {};

  return prisma.tipoHabitacion.findMany({
    where: { ...filtroActivoDesdeQuery(activo), ...filtroHabitacionActiva },
    orderBy: { nombre: "asc" },
  });
}

async function obtenerTipoHabitacionPorId(id) {
  const tipoId = Number(id);
  if (!Number.isInteger(tipoId) || tipoId < 1) throw new ErrorDeNegocio("id debe ser un número entero mayor a 0.");
  const tipo = await prisma.tipoHabitacion.findUnique({ where: { id: tipoId } });
  if (!tipo) throw new ErrorDeNegocio("Tipo de habitación no encontrado.", 404);
  return tipo;
}

// Baja lógica (regla 3): bloqueada si el tipo tiene habitaciones ACTIVAS
// asociadas, con el conteo en el mensaje — mismo patrón que
// cambiarEstadoProveedor en proveedores.servicio.js. Reactivar
// (false -> true) no tiene esta restricción.
async function cambiarActivoTipoHabitacion(id, activo) {
  const tipoId = Number(id);
  if (!Number.isInteger(tipoId) || tipoId < 1) throw new ErrorDeNegocio("id debe ser un número entero mayor a 0.");
  if (typeof activo !== "boolean") throw new ErrorDeNegocio("activo debe ser booleano.");

  const existente = await prisma.tipoHabitacion.findUnique({ where: { id: tipoId } });
  if (!existente) throw new ErrorDeNegocio("Tipo de habitación no encontrado.", 404);

  if (existente.activo && !activo) {
    const enUso = await prisma.habitacion.count({ where: { tipoHabitacionId: tipoId, activo: true } });
    if (enUso > 0) {
      throw new ErrorDeNegocio(
        `No se puede dar de baja: hay ${enUso} habitación${enUso > 1 ? "es" : ""} activa${enUso > 1 ? "s" : ""} de este tipo.`,
        409
      );
    }
  }

  return prisma.tipoHabitacion.update({ where: { id: tipoId }, data: { activo } });
}

module.exports = {
  ErrorDeNegocio,
  crearTipoHabitacion,
  actualizarTipoHabitacion,
  listarTiposHabitacion,
  obtenerTipoHabitacionPorId,
  cambiarActivoTipoHabitacion,
};
