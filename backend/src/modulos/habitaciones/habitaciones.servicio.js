// Administración de Habitaciones (HU-31 a HU-35).
// Lógica de negocio pura: no conoce HTTP y mantiene las escrituras
// relacionadas dentro de una misma transacción de Prisma.

const prisma = require("../../lib/prisma");
const {
  ESTADOS_HABITACION,
  TIPOS_TAREA_MANTENIMIENTO,
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

// Transiciones que puede disparar el cambio MANUAL de estado (PATCH
// /:id/estado, el "Cambiar estado" del staff) — no es la matriz completa
// del sistema, es la de esta puerta específica. "ocupada" y "mantenimiento"
// nunca son destino válido por acá a propósito:
//   - "ocupada" solo se llega por un check-in real (ver ocuparHabitacion en
//     checkIn.servicio.js, que ya no pasa por esta función — hace su propio
//     update para no heredar esta restricción).
//   - "mantenimiento" solo se llega por crearOrdenMantenimiento (más abajo
//     en este archivo, guarda `estadoAnterior` y tampoco pasa por acá).
// Ninguna transición SALE de "mantenimiento" por acá tampoco — la única
// salida es resolverOrdenMantenimiento, que restaura `estadoAnterior`.
const TRANSICIONES_MANUALES_VALIDAS = {
  libre: ["bloqueada", "en limpieza"],
  ocupada: [],
  mantenimiento: [],
  bloqueada: ["libre", "en limpieza"],
  "en limpieza": ["libre", "bloqueada"],
};

function validarTransicionManual(estadoActual, estadoDestino) {
  if (TRANSICIONES_MANUALES_VALIDAS[estadoActual]?.includes(estadoDestino)) return;

  if (estadoDestino === "ocupada") {
    throw new ErrorDeNegocio('No se puede pasar una habitación a "ocupada" desde acá — esa transición ocurre únicamente en un check-in real.');
  }
  if (estadoDestino === "mantenimiento") {
    throw new ErrorDeNegocio('No se puede pasar una habitación a "mantenimiento" desde acá — registrá una orden de mantenimiento en su lugar.');
  }
  if (estadoActual === "mantenimiento") {
    throw new ErrorDeNegocio("Esta habitación está en mantenimiento — la única salida es resolver la orden de mantenimiento correspondiente.");
  }
  if (estadoActual === "ocupada") {
    throw new ErrorDeNegocio("Esta transición requiere un check-out, no está disponible todavía.");
  }
  throw new ErrorDeNegocio(`No se puede pasar de "${estadoActual}" a "${estadoDestino}".`);
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

async function cambiarEstadoHabitacion(id, estado, motivoBloqueo, cliente = prisma) {
  const habitacionId = enteroPositivo(id, "id");
  const estadoValidado = validarEstado(estado);
  const actual = await cliente.habitacion.findUnique({ where: { id: habitacionId } });
  if (!actual) throw new ErrorDeNegocio("Habitación no encontrada.", 404);
  if (!actual.activo) throw new ErrorDeNegocio("No se puede cambiar el estado de una habitación dada de baja.");
  validarTransicionManual(actual.estado, estadoValidado);

  const data = { estado: estadoValidado };
  // Obligatorio solo para "bloqueada" — para las demás transiciones no se
  // toca la columna (queda con lo que tenía, sin efecto: solo se lee/
  // muestra cuando estado = "bloqueada", así que un valor viejo no importa
  // y se pisa solo la próxima vez que se vuelva a bloquear la habitación).
  if (estadoValidado === "bloqueada") {
    data.motivoBloqueo = textoObligatorio(motivoBloqueo, "El motivo de bloqueo", LIMITES_HABITACION.motivoBloqueo);
  }
  return cliente.habitacion.update({ where: { id: habitacionId }, data });
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

  return prisma.$transaction(
    async (tx) => {
      const habitacion = await tx.habitacion.findUnique({ where: { id: habitacionId } });
      if (!habitacion || !habitacion.activo) {
        throw new ErrorDeNegocio("La habitación no existe o está dada de baja.", 404);
      }

      const orden = await tx.ordenMantenimiento.create({
        data: { habitacionId, tipoTarea, responsable, urgente },
      });

      // Guarda el estado previo (ver Habitacion.estadoAnterior) para poder
      // devolverla ahí, y no siempre a "libre", cuando la orden se resuelva
      // — ej. una queja de huésped sobre una habitación OCUPADA no debe
      // liberarla sola al terminar el arreglo.
      await tx.habitacion.update({
        where: { id: habitacionId },
        data: { estado: "mantenimiento", estadoAnterior: habitacion.estado },
      });

      return { ...orden, habitacion: { id: habitacion.id, numero: habitacion.numero, tipo: habitacion.tipo } };
    },
    { timeout: 15000, maxWait: 10000 }
  );
}

// Reparto de responsabilidad (Sprint 3, corrección): Housekeeping y
// Recepcionista pueden reportar (crearOrdenMantenimiento), pero solo
// Housekeeping puede resolver — el gate de rol vive en el frontend
// (sesion.jsx: resolverMantenimiento), igual que el resto del módulo.
async function resolverOrdenMantenimiento(ordenIdEntrada, resueltaPor) {
  const ordenId = enteroPositivo(ordenIdEntrada, "id");
  const resueltaPorTexto = textoObligatorio(resueltaPor, "resueltaPor", LIMITES_HABITACION.responsable);

  return prisma.$transaction(
    async (tx) => {
      const orden = await tx.ordenMantenimiento.findUnique({ where: { id: ordenId }, include: { habitacion: true } });
      if (!orden) throw new ErrorDeNegocio("Orden de mantenimiento no encontrada.", 404);
      if (orden.estado === "Resuelta") throw new ErrorDeNegocio("La orden ya está resuelta.");

      const ordenActualizada = await tx.ordenMantenimiento.update({
        where: { id: ordenId },
        data: { estado: "Resuelta", resueltaEn: new Date(), resueltaPor: resueltaPorTexto },
      });

      // Si mientras tanto alguien ya sacó la habitación de "mantenimiento"
      // a mano (PATCH /:id/estado), no la pisamos: solo restauramos el
      // estado previo si todavía sigue en mantenimiento por esta orden. Y
      // si queda otra orden "Pendiente" para la misma habitación (más de un
      // incidente abierto a la vez), tampoco la restauramos todavía — recién
      // cuando se resuelve la última pendiente.
      if (orden.habitacion.estado === "mantenimiento") {
        const quedanPendientes = await tx.ordenMantenimiento.count({
          where: { habitacionId: orden.habitacionId, estado: "Pendiente", id: { not: ordenId } },
        });
        if (quedanPendientes === 0) {
          await tx.habitacion.update({
            where: { id: orden.habitacionId },
            data: { estado: orden.habitacion.estadoAnterior || "libre", estadoAnterior: null },
          });
        }
      }

      return { ...ordenActualizada, habitacion: { id: orden.habitacion.id, numero: orden.habitacion.numero } };
    },
    { timeout: 15000, maxWait: 10000 }
  );
}

async function listarOrdenesMantenimiento({ habitacionId } = {}) {
  const id = habitacionId ? enteroPositivo(habitacionId, "habitacionId") : null;
  return prisma.ordenMantenimiento.findMany({
    where: id ? { habitacionId: id } : {},
    include: { habitacion: true },
    orderBy: { fecha: "desc" },
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
  resolverOrdenMantenimiento,
  listarOrdenesMantenimiento,
  ErrorDeNegocio,
};
