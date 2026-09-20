// Check-in (HU-43 a HU-47).
//
// No tiene tabla propia (ver Modelo_de_Datos_Sprint3_Holiday_Inn.docx): es
// lógica sobre `Reserva` (Integrante 2) y `Habitacion` (Integrante 1). El
// check-in en sí es la transición `Reserva.estado: 'Confirmada' → 'En curso'`
// + `Habitacion.estado: 'libre' → 'ocupada'`, siempre en una misma
// transacción (HU-47).
//
// Reuso de otros módulos, no reimplementación (ver Sprint3_..._CheckIn...md,
// sección 0): `reservasServicio.obtenerReserva/crearReservaEnTransaccion/
// marcarEnCurso` y `habitacionesServicio.cambiarEstadoHabitacion` son los
// mismos que ya usan y prueban Reservas y Habitaciones.

const prisma = require("../../lib/prisma");
const reservasServicio = require("../reservas/reservas.servicio");
const habitacionesServicio = require("../habitaciones/habitaciones.servicio");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const { MEDIOS_GARANTIA } = require("./checkIn.constantes");

// ErrorDeNegocio duplicada a propósito (mismo criterio documentado en
// movimientoSalida.servicio.js): esta carpeta queda autocontenida.
class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Misma zona de referencia que reservas.constantes.js / frontend/lib/fechas.js
// — duplicada acá porque es un literal, no lógica (mismo criterio que el
// resto del proyecto para constantes compartidas entre módulos).
const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

function hoyComoFechaISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
}

function hoyComoFechaUTC() {
  return new Date(`${hoyComoFechaISO()}T00:00:00.000Z`);
}

function formatearFechaCorta(fechaISO) {
  return new Date(fechaISO).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

function documentosCoinciden(a, b) {
  return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
}

function enteroPositivo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor a 0.`);
  return numero;
}

// --------------------------------------------------------------
// HU-43 — validación de vigencia (compartida entre "buscar" y "confirmar")
// --------------------------------------------------------------

// Lanza ErrorDeNegocio con el motivo puntual si la reserva no está en
// condiciones de iniciar el check-in. Separada de `buscarReservaParaCheckIn`
// para que el mismo chequeo se use también, sin duplicarlo, justo antes de
// escribir en `confirmarCheckInConReserva` — la pantalla puede haber quedado
// abierta un rato y la reserva pudo cambiar de estado mientras tanto.
function validarReservaVigente(reserva) {
  if (reserva.estado === ESTADO_RESERVA.CANCELADA) {
    throw new ErrorDeNegocio("La reserva está cancelada — no se puede hacer el check-in.");
  }
  if (reserva.estado === ESTADO_RESERVA.EN_CURSO) {
    throw new ErrorDeNegocio("Esta reserva ya tiene el check-in registrado.");
  }
  if (reserva.estado === ESTADO_RESERVA.CERRADA) {
    throw new ErrorDeNegocio("Esta reserva ya completó el check-out.");
  }
  if (reserva.estado !== ESTADO_RESERVA.CONFIRMADA) {
    throw new ErrorDeNegocio(`Estado de reserva inesperado: "${reserva.estado}".`);
  }
  // HU-43: "valida que la reserva ... esté vigente" — la tarea técnica lo
  // aclara como "fecha de ingreso": no se puede hacer check-in antes del
  // día de la reserva. No se bloquea después de fechaHasta a propósito: un
  // huésped que llega más tarde de lo previsto igual tiene que poder
  // registrar su ingreso (no es un caso que el criterio pida impedir).
  const hoy = hoyComoFechaUTC();
  const desde = new Date(reserva.fechaDesde);
  const desdeUTC = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  if (desdeUTC > hoy.getTime()) {
    throw new ErrorDeNegocio(
      `El check-in habilita a partir del ${formatearFechaCorta(reserva.fechaDesde)} (fecha de ingreso de la reserva).`
    );
  }
}

// HU-43 — búsqueda por id, por código de confirmación o por documento del
// huésped (un solo campo del lado del mostrador: `codigo` prueba primero
// como código exacto y si no matchea nada cae a documento — ver
// reservasServicio.obtenerPorCodigoODocumento), sin lanzar error de
// vigencia: la pantalla necesita poder MOSTRAR la reserva encontrada y el
// motivo por el que el check-in todavía no se puede confirmar (si aplica),
// no solo un 400 genérico.
async function buscarReservaParaCheckIn({ id, codigo } = {}) {
  let reserva;
  if (id) reserva = await reservasServicio.obtenerReserva(id);
  else if (codigo && String(codigo).trim()) reserva = await reservasServicio.obtenerPorCodigoODocumento(codigo);
  else throw new ErrorDeNegocio("Indicá el id o el código de confirmación / documento de la reserva.");

  let motivoBloqueo = null;
  try {
    validarReservaVigente(reserva);
  } catch (err) {
    motivoBloqueo = err.message;
  }
  return { reserva, puedeIniciarCheckIn: !motivoBloqueo, motivoBloqueo };
}

// --------------------------------------------------------------
// HU-46 — validación de pago/garantía (mockeada, ver checkIn.constantes.js)
// --------------------------------------------------------------

function validarGarantia({ garantiaConfirmada, medioGarantia }) {
  if (garantiaConfirmada !== true) {
    throw new ErrorDeNegocio(
      "No se puede confirmar el check-in sin validar el pago o la garantía del huésped (tarjeta o depósito)."
    );
  }
  if (!MEDIOS_GARANTIA.includes(medioGarantia)) {
    throw new ErrorDeNegocio(`medioGarantia debe ser uno de: ${MEDIOS_GARANTIA.join(", ")}.`);
  }
}

// --------------------------------------------------------------
// HU-47 — ocupar una habitación dentro de una transacción ya abierta
// --------------------------------------------------------------

// A diferencia de la disponibilidad de HU-38 (que ignora `Habitacion.estado`
// a propósito, por tratarse de fechas futuras — ver reservas.servicio.js),
// acá el check-in ocupa la habitación DE INMEDIATO: si en el momento de
// confirmar la habitación ya no está "libre" (pasó a mantenimiento, quedó
// bloqueada, etc.), no tiene sentido pisarla a "ocupada" en silencio.
async function ocuparHabitacion(tx, habitacionId) {
  const habitacion = await tx.habitacion.findUnique({ where: { id: habitacionId } });
  if (!habitacion) throw new ErrorDeNegocio("La habitación indicada no existe.", 404);
  if (habitacion.estado !== "libre") {
    throw new ErrorDeNegocio(
      `La habitación ${habitacion.numero} no está libre (estado actual: "${habitacion.estado}") — no se puede completar el check-in.`
    );
  }
  await habitacionesServicio.cambiarEstadoHabitacion(habitacionId, "ocupada", null, tx);
}

// --------------------------------------------------------------
// HU-43 + HU-46 + HU-47 — confirmar check-in de una reserva existente
// --------------------------------------------------------------

async function confirmarCheckInConReserva({ reservaId, numeroDocumentoIngresado, garantiaConfirmada, medioGarantia }) {
  const id = enteroPositivo(reservaId, "reservaId");
  const reserva = await reservasServicio.obtenerReserva(id);
  validarReservaVigente(reserva);

  // HU-43 — "verificación del documento de identidad contra los datos de
  // Huesped": comparación real contra lo que ya quedó cargado en la
  // reserva, no una casilla decorativa que se puede tildar sin mirar.
  if (!documentosCoinciden(numeroDocumentoIngresado, reserva.huesped?.numeroDocumento)) {
    throw new ErrorDeNegocio(
      `El documento ingresado no coincide con el de la reserva (${reserva.huesped?.tipoDocumento} ${reserva.huesped?.numeroDocumento}).`
    );
  }

  validarGarantia({ garantiaConfirmada, medioGarantia });

  await prisma.$transaction(
    async (tx) => {
      await reservasServicio.marcarEnCurso(id, tx);
      for (const habitacion of reserva.habitaciones) {
        await ocuparHabitacion(tx, habitacion.id);
      }
    },
    { timeout: 15000, maxWait: 10000 }
  );

  return reservasServicio.obtenerReserva(id);
}

// --------------------------------------------------------------
// HU-44 + HU-45 — disponibilidad "ahora mismo" para walk-in / asignación
// manual de habitación (HU-45 solo tiene selección manual: sin sugerencia
// automática por tipo/disponibilidad/preferencias, ver decisiones.md).
// --------------------------------------------------------------

// Reusa la disponibilidad por fechas de Reservas (HU-38) y le suma el filtro
// de estado físico "libre ahora" que acá sí importa (ver comentario de
// ocuparHabitacion). No reimplementa el cálculo de solapamiento.
async function listarHabitacionesLibresAhora({ fechaHasta, tipo, capacidadMinima }) {
  const fechaDesde = hoyComoFechaISO();
  const disponibilidad = await reservasServicio.consultarDisponibilidad({
    fechaDesde,
    fechaHasta,
    tipo,
    capacidadMinima,
  });
  const libresAhora = disponibilidad.habitaciones.filter((h) => h.estado === "libre");
  // El `resumenPorTipo` de Reservas (HU-38) cuenta "disponible por fecha",
  // ignorando el estado físico a propósito — para acá hace falta el número
  // más estricto ("libre AHORA"), si no el resumen le muestra al
  // recepcionista más habitaciones de las que en realidad puede asignar en
  // este momento (detectado probando el flujo real, no solo con los tests).
  const resumenPorTipo = disponibilidad.resumenPorTipo.map((r) => ({
    ...r,
    disponibles: libresAhora.filter((h) => h.tipo === r.tipo).length,
  }));
  return { ...disponibilidad, habitaciones: libresAhora, resumenPorTipo };
}

// --------------------------------------------------------------
// HU-44 — check-in walk-in: crea la reserva y confirma el check-in en un
// solo paso, reusando el alta de Reservas (HU-36) tal cual.
// --------------------------------------------------------------

async function registrarCheckInWalkIn({ fechaHasta, habitacionIds, huesped, garantiaConfirmada, medioGarantia }) {
  validarGarantia({ garantiaConfirmada, medioGarantia });

  // Mismo alta que HU-36 (recepcionista) — la "reserva inmediata" que pide
  // la tarea técnica de HU-44 no es un modelo aparte, es una Reserva común
  // que arranca hoy. `normalizarAltaReserva` valida el rango de fechas, el
  // huésped y las habitaciones exactamente igual que un alta asistida.
  const datos = reservasServicio.normalizarAltaReserva({
    fechaDesde: hoyComoFechaISO(),
    fechaHasta,
    habitacionIds,
    huesped,
    origen: "RECEPCION",
  });

  const reservaId = await prisma.$transaction(
    async (tx) => {
      const reserva = await reservasServicio.crearReservaEnTransaccion(tx, datos);
      await reservasServicio.marcarEnCurso(reserva.id, tx);
      for (const habitacionId of datos.habitacionIds) {
        await ocuparHabitacion(tx, habitacionId);
      }
      return reserva.id;
    },
    { timeout: 15000, maxWait: 10000 }
  );

  return reservasServicio.obtenerReserva(reservaId);
}

module.exports = {
  buscarReservaParaCheckIn,
  confirmarCheckInConReserva,
  listarHabitacionesLibresAhora,
  registrarCheckInWalkIn,
  validarReservaVigente,
  ErrorDeNegocio,
};
