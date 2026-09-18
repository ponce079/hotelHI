// Administración de Habitaciones (HU-31 a HU-35).
// Lógica de negocio pura: no conoce HTTP y mantiene las escrituras
// relacionadas dentro de una misma transacción de Prisma.

const prisma = require("../../lib/prisma");
const {
  ESTADOS_HABITACION,
  TIPOS_TAREA_MANTENIMIENTO,
  CANALES_NOTIFICACION,
  LIMITES_HABITACION,
} = require("./habitaciones.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

function enteroPositivo(valor, campo, { permitirCero = false } = {}) {
  const numero = Number(valor);
  const minimo = permitirCero ? 0 : 1;
  if (!Number.isInteger(numero) || numero < minimo) {
    throw new ErrorDeNegocio(`${campo} debe ser un número entero ${permitirCero ? "mayor o igual a 0" : "mayor a 0"}.`);
  }
  return numero;
}

function textoObligatorio(valor, campo, maximo) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw new ErrorDeNegocio(`${campo} es obligatorio.`);
  if (texto.length > maximo) {
    throw new ErrorDeNegocio(`${campo} no puede superar los ${maximo} caracteres.`);
  }
  return texto;
}

function normalizarHabitacion(data) {
  const numero = textoObligatorio(data?.numero, "numero", LIMITES_HABITACION.numero);
  const tipo = textoObligatorio(data?.tipo, "tipo", LIMITES_HABITACION.tipo);
  const capacidad = enteroPositivo(data?.capacidad, "capacidad");
  const piso = enteroPositivo(data?.piso, "piso", { permitirCero: true });
  const tarifaPorNoche = Number(data?.tarifaPorNoche);
  if (!Number.isFinite(tarifaPorNoche) || tarifaPorNoche <= 0) {
    throw new ErrorDeNegocio("tarifaPorNoche debe ser un número mayor a 0.");
  }

  const equipamiento = typeof data?.equipamiento === "string" ? data.equipamiento.trim() : "";
  if (equipamiento.length > LIMITES_HABITACION.equipamiento) {
    throw new ErrorDeNegocio(`equipamiento no puede superar los ${LIMITES_HABITACION.equipamiento} caracteres.`);
  }

  return {
    numero,
    tipo,
    capacidad,
    piso,
    equipamiento: equipamiento || null,
    tarifaPorNoche,
  };
}

function validarEstado(estado) {
  if (!ESTADOS_HABITACION.includes(estado)) {
    throw new ErrorDeNegocio(`estado debe ser uno de: ${ESTADOS_HABITACION.join(", ")}.`);
  }
  return estado;
}

async function listarHabitaciones({ q, tipo, estado, activo } = {}) {
  if (estado) validarEstado(estado);

  const where = {
    ...(activo === "todos" ? {} : { activo: activo === "false" ? false : true }),
    ...(tipo ? { tipo } : {}),
    ...(estado ? { estado } : {}),
    ...(q
      ? {
          OR: [
            { numero: { contains: q.trim() } },
            { tipo: { contains: q.trim() } },
            { equipamiento: { contains: q.trim() } },
          ],
        }
      : {}),
  };

  return prisma.habitacion.findMany({
    where,
    orderBy: [{ activo: "desc" }, { piso: "asc" }, { numero: "asc" }],
  });
}

async function listarTiposHabitacion() {
  const filas = await prisma.habitacion.findMany({
    where: { activo: true },
    select: { tipo: true },
    distinct: ["tipo"],
    orderBy: { tipo: "asc" },
  });
  return filas.map((fila) => fila.tipo);
}

async function obtenerHabitacion(id) {
  const habitacion = await prisma.habitacion.findUnique({
    where: { id: Number(id) },
    include: {
      ordenesMantenimiento: {
        orderBy: { fecha: "desc" },
        include: { notificaciones: true },
      },
    },
  });
  if (!habitacion) throw new ErrorDeNegocio("Habitación no encontrada.", 404);
  return habitacion;
}

async function crearHabitacion(data) {
  const normalizada = normalizarHabitacion(data);
  const existente = await prisma.habitacion.findUnique({ where: { numero: normalizada.numero } });
  if (existente) throw new ErrorDeNegocio(`Ya existe una habitación con el número "${normalizada.numero}".`, 409);

  try {
    return await prisma.habitacion.create({ data: normalizada });
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ErrorDeNegocio(`Ya existe una habitación con el número "${normalizada.numero}".`, 409);
    }
    throw err;
  }
}

async function actualizarHabitacion(id, data) {
  const habitacionId = enteroPositivo(id, "id");
  const actual = await prisma.habitacion.findUnique({ where: { id: habitacionId } });
  if (!actual) throw new ErrorDeNegocio("Habitación no encontrada.", 404);

  const normalizada = normalizarHabitacion(data);
  const duplicada = await prisma.habitacion.findFirst({
    where: { numero: normalizada.numero, id: { not: habitacionId } },
  });
  if (duplicada) throw new ErrorDeNegocio(`Ya existe una habitación con el número "${normalizada.numero}".`, 409);

  try {
    return await prisma.habitacion.update({ where: { id: habitacionId }, data: normalizada });
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ErrorDeNegocio(`Ya existe una habitación con el número "${normalizada.numero}".`, 409);
    }
    throw err;
  }
}

async function cambiarEstadoHabitacion(id, estado, cliente = prisma) {
  const habitacionId = enteroPositivo(id, "id");
  const estadoValidado = validarEstado(estado);
  const actual = await cliente.habitacion.findUnique({ where: { id: habitacionId } });
  if (!actual) throw new ErrorDeNegocio("Habitación no encontrada.", 404);
  if (!actual.activo) throw new ErrorDeNegocio("No se puede cambiar el estado de una habitación dada de baja.");
  return cliente.habitacion.update({ where: { id: habitacionId }, data: { estado: estadoValidado } });
}

async function cambiarActivoHabitacion(id, activo) {
  const habitacionId = enteroPositivo(id, "id");
  if (typeof activo !== "boolean") throw new ErrorDeNegocio("activo debe ser booleano.");
  const actual = await prisma.habitacion.findUnique({ where: { id: habitacionId } });
  if (!actual) throw new ErrorDeNegocio("Habitación no encontrada.", 404);
  return prisma.habitacion.update({ where: { id: habitacionId }, data: { activo } });
}

function normalizarTipoTarea(valor) {
  const encontrado = TIPOS_TAREA_MANTENIMIENTO.find(
    (tipo) => tipo.toLowerCase() === String(valor ?? "").trim().toLowerCase()
  );
  if (!encontrado) {
    throw new ErrorDeNegocio(`tipoTarea debe ser uno de: ${TIPOS_TAREA_MANTENIMIENTO.join(", ")}.`);
  }
  return encontrado;
}

async function crearOrdenMantenimiento(habitacionIdEntrada, data) {
  const habitacionId = enteroPositivo(habitacionIdEntrada, "habitacionId");
  const tipoTarea = normalizarTipoTarea(data?.tipoTarea);
  const responsable = textoObligatorio(data?.responsable, "responsable", LIMITES_HABITACION.responsable);
  const urgente = data?.urgente === true;
  const canal = data?.canal || "Interno";
  if (!CANALES_NOTIFICACION.includes(canal)) {
    throw new ErrorDeNegocio(`canal debe ser uno de: ${CANALES_NOTIFICACION.join(", ")}.`);
  }
  const destinatarioArea = urgente
    ? textoObligatorio(data?.destinatarioArea || "Mantenimiento", "destinatarioArea", LIMITES_HABITACION.areaDestino)
    : null;
  const mensajeIngresado = typeof data?.mensaje === "string" ? data.mensaje.trim() : "";
  if (mensajeIngresado.length > LIMITES_HABITACION.mensaje) {
    throw new ErrorDeNegocio(`mensaje no puede superar los ${LIMITES_HABITACION.mensaje} caracteres.`);
  }

  return prisma.$transaction(
    async (tx) => {
      const habitacion = await tx.habitacion.findUnique({ where: { id: habitacionId } });
      if (!habitacion || !habitacion.activo) {
        throw new ErrorDeNegocio("La habitación no existe o está dada de baja.", 404);
      }

      const orden = await tx.ordenMantenimiento.create({
        data: { habitacionId, tipoTarea, responsable },
      });

      await cambiarEstadoHabitacion(habitacionId, "mantenimiento", tx);

      let notificacion = null;
      if (urgente) {
        notificacion = await tx.notificacion.create({
          data: {
            tipo: "Mantenimiento",
            habitacionId,
            ordenMantenimientoId: orden.id,
            destinatarioArea,
            canal,
            mensaje:
              mensajeIngresado ||
              `Incidente urgente en la habitación ${habitacion.numero}: mantenimiento ${tipoTarea.toLowerCase()}.`,
          },
        });
      }

      return {
        orden: { ...orden, habitacion: { id: habitacion.id, numero: habitacion.numero, tipo: habitacion.tipo } },
        notificacion,
      };
    },
    { timeout: 15000, maxWait: 10000 }
  );
}

async function listarOrdenesMantenimiento({ habitacionId } = {}) {
  const id = habitacionId ? enteroPositivo(habitacionId, "habitacionId") : null;
  return prisma.ordenMantenimiento.findMany({
    where: id ? { habitacionId: id } : {},
    include: { habitacion: true, notificaciones: true },
    orderBy: { fecha: "desc" },
  });
}

async function listarNotificaciones({ habitacionId } = {}) {
  const id = habitacionId ? enteroPositivo(habitacionId, "habitacionId") : null;
  return prisma.notificacion.findMany({
    where: { tipo: "Mantenimiento", ...(id ? { habitacionId: id } : {}) },
    include: { habitacion: true, ordenMantenimiento: true },
    orderBy: { fechaEnvio: "desc" },
  });
}

module.exports = {
  listarHabitaciones,
  listarTiposHabitacion,
  obtenerHabitacion,
  crearHabitacion,
  actualizarHabitacion,
  cambiarEstadoHabitacion,
  cambiarActivoHabitacion,
  crearOrdenMantenimiento,
  listarOrdenesMantenimiento,
  listarNotificaciones,
  ErrorDeNegocio,
};
