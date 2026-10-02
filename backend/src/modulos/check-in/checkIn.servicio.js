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
// marcarEnCurso` son los mismos que ya usan y prueban Reservas.
//
// `Habitacion.estado: 'libre' → 'ocupada'` (HU-47, en ocuparHabitaciones más
// abajo) se hace con un update directo, NO con
// `habitacionesServicio.cambiarEstadoHabitacion` — corrección posterior:
// esa función ahora valida una matriz de transiciones MANUALES (el
// "Cambiar estado" del staff) que bloquea a propósito cualquier salto a
// "ocupada" por esa vía, porque la única transición legítima es esta, la
// del check-in real. Mismo criterio que ya usan crearOrdenMantenimiento y
// checkOut.servicio.js para sus propias transiciones de negocio.

const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const reservasServicio = require("../reservas/reservas.servicio");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const { CONCEPTO_GARANTIA } = require("../pagos-estadia/pagoEstadia.constantes");
const { MEDIOS_GARANTIA, MEDIOS_CON_TARJETA, MONTO_GARANTIA } = require("./checkIn.constantes");

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

// reservasServicio.obtenerReserva/obtenerPorCodigoODocumento tiran SU
// propio ErrorDeNegocio (distinta clase), que checkIn.controlador.js no
// reconoce — sin esto, un código/documento inexistente cae en 500 genérico
// en vez del 404 que la búsqueda necesita para poder ofrecer un fallback
// (ver mismo patrón, mismo comentario, en checkOut.servicio.js).
function envolverErrorReservas(err) {
  if (err instanceof reservasServicio.ErrorDeNegocio) {
    return new ErrorDeNegocio(err.message, err.statusCode);
  }
  return err;
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
  try {
    if (id) reserva = await reservasServicio.obtenerReserva(id);
    else if (codigo && String(codigo).trim()) reserva = await reservasServicio.obtenerPorCodigoODocumento(codigo);
    else throw new ErrorDeNegocio("Indicá el id o el código de confirmación / documento de la reserva.");
  } catch (err) {
    throw envolverErrorReservas(err);
  }

  let motivoBloqueo = null;
  try {
    validarReservaVigente(reserva);
  } catch (err) {
    motivoBloqueo = err.message;
  }
  return { reserva, puedeIniciarCheckIn: !motivoBloqueo, motivoBloqueo };
}

// --------------------------------------------------------------
// HU-46 — validación de pago/garantía. Mismos 4 medios que la seña de
// reserva (HU-88), pero NO es lo mismo que la seña ni que un pago de
// check-out (HU-50): es un depósito de seguridad por daños/faltantes, un
// monto FIJO (MONTO_GARANTIA, política del hotel, no un dato que mande el
// cliente) ajeno al total de la estadía — corrección posterior 2026-09-25,
// después de que autorizar/cobrar el total completo de la habitación
// (como se hacía antes) rechazara apenas la reserva ya tenía una seña paga
// o la estadía costaba menos que ese total.
//
// Por eso NO se registra con pagoEstadiaServicio.crearPago: esa función
// exige que el importe no supere el saldo pendiente de la reserva, que es
// exactamente la regla que no aplica acá (la garantía es plata aparte, no
// un pago a cuenta del alojamiento). Sigue quedando como un PagoEstadia
// real (concepto Garantía) para que se vea en Movimientos de Pago y
// consolidarCargos la tenga en cuenta como ya cobrada. Qué pasa con ella en
// el check-out (devolverla si no hubo daños, descontarla si los hubo)
// queda pendiente como otra tarea — esto solo cubre el cobro en el check-in.
// --------------------------------------------------------------

function validarGarantia({ garantiaConfirmada, medioGarantia, referenciaGarantia }) {
  if (garantiaConfirmada !== true) {
    throw new ErrorDeNegocio("No se puede confirmar el check-in sin validar la garantía del huésped.");
  }
  if (!MEDIOS_GARANTIA.includes(medioGarantia)) {
    throw new ErrorDeNegocio(`medioGarantia debe ser uno de: ${MEDIOS_GARANTIA.join(", ")}.`);
  }
  if (MEDIOS_CON_TARJETA.includes(medioGarantia) && !referenciaGarantia) {
    throw new ErrorDeNegocio(`El pago con ${medioGarantia} necesita la autorización de la tarjeta (referencia).`);
  }
}

// Se llama DESPUÉS de que el check-in ya quedó confirmado (reserva "En
// curso", habitación "ocupada"): si esto fallara, el check-in en sí no
// queda a medio hacer — el recepcionista puede reintentar el cobro de la
// garantía aparte, desde Pagos, sin tener que repetir el check-in.
async function registrarGarantia(reservaId, { medioGarantia, referenciaGarantia }) {
  await prisma.pagoEstadia.create({
    data: {
      reservaId,
      estado: "Pagado",
      concepto: CONCEPTO_GARANTIA,
      medios: {
        create: [
          {
            medioPago: medioGarantia,
            importe: MONTO_GARANTIA,
            ...(referenciaGarantia ? { referencia: referenciaGarantia } : {}),
          },
        ],
      },
    },
  });
}

// --------------------------------------------------------------
// HU-47 — ocupar una habitación dentro de una transacción ya abierta
// --------------------------------------------------------------

// La reserva que llega acá pudo haberse hecho con `Habitacion.estado`
// ignorado a propósito (una entrada a futuro, HU-38 — ver reservas.servicio.js),
// pero el check-in ocupa la habitación DE INMEDIATO, hoy: si en el momento
// de confirmar la habitación ya no está "libre" (pasó a mantenimiento, quedó
// bloqueada, etc.), no tiene sentido pisarla a "ocupada" en silencio.
//
// Ocupa TODAS las habitaciones de la reserva con una lectura y una escritura
// (antes: ocuparHabitacion, un findUnique y un update por habitación), para que
// las consultas no crezcan con la cantidad de habitaciones.
async function ocuparHabitaciones(tx, habitacionIds) {
  const habitaciones = await tx.habitacion.findMany({ where: { id: { in: habitacionIds } } });
  const porId = new Map(habitaciones.map((h) => [h.id, h]));
  for (const habitacionId of habitacionIds) {
    const habitacion = porId.get(habitacionId);
    if (!habitacion) throw new ErrorDeNegocio("La habitación indicada no existe.", 404);
    if (habitacion.estado !== "libre") {
      throw new ErrorDeNegocio(
        `La habitación ${habitacion.numero} no está libre (estado actual: "${habitacion.estado}") — ` +
          "no se puede completar el check-in."
      );
    }
  }
  // Update directo, no `cambiarEstadoHabitacion` — ver el comentario del
  // encabezado de este archivo.
  await tx.habitacion.updateMany({ where: { id: { in: habitacionIds } }, data: { estado: "ocupada" } });
}

// --------------------------------------------------------------
// HU-43 + HU-46 + HU-47 — confirmar check-in de una reserva existente
// --------------------------------------------------------------

async function confirmarCheckInConReserva({
  confirmacionAmpliacion,
  operador,
  reservaId,
  numeroDocumentoIngresado,
  garantiaConfirmada,
  medioGarantia,
  referenciaGarantia,
}) {
  const id = enteroPositivo(reservaId, "reservaId");
  let reserva;
  try {
    reserva = await reservasServicio.obtenerReserva(id);
  } catch (err) {
    throw envolverErrorReservas(err);
  }
  validarReservaVigente(reserva);

  // HU-43 — "verificación del documento de identidad contra los datos de
  // Huesped": comparación real contra lo que ya quedó cargado en la
  // reserva, no una casilla decorativa que se puede tildar sin mirar.
  if (!documentosCoinciden(numeroDocumentoIngresado, reserva.huesped?.numeroDocumento)) {
    throw new ErrorDeNegocio(
      `El documento ingresado no coincide con el de la reserva (${reserva.huesped?.tipoDocumento} ${reserva.huesped?.numeroDocumento}).`
    );
  }

  validarGarantia({ garantiaConfirmada, medioGarantia, referenciaGarantia });

  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${id} FOR UPDATE`;
      const vigente = await tx.reserva.findUnique({ where: { id } });
      validarReservaVigente(vigente);
      await require("../estadia/ampliacion.servicio").ampliarSiCorresponde(tx, id, confirmacionAmpliacion);
      await require("../estadia/ingreso").prepararIngreso(tx, id, operador);
      await reservasServicio.marcarEnCurso(id, tx);
      await ocuparHabitaciones(
        tx,
        reserva.habitaciones.map((habitacion) => habitacion.id)
      );
    },
    OPCIONES_TRANSACCION
  );

  await registrarGarantia(id, { medioGarantia, referenciaGarantia });

  return reservasServicio.obtenerReserva(id);
}

// --------------------------------------------------------------
// HU-44 + HU-45 — disponibilidad "ahora mismo" para walk-in / asignación
// manual de habitación (HU-45 solo tiene selección manual: sin sugerencia
// automática por tipo/disponibilidad/preferencias, ver decisiones.md).
// --------------------------------------------------------------

// Reusa la disponibilidad de Reservas (HU-38): consultarDisponibilidad ya
// exige por sí sola "libre AHORA" (`esLibreAhora`, ver reservas.servicio.js)
// cuando `fechaDesde` es hoy, que es siempre el caso acá — walk-in y
// asignación manual son "ahora", nunca a futuro. No hay filtro propio que
// reimplementar: si hubiera dos, correrían el riesgo de desincronizarse.
async function listarHabitacionesLibresAhora({ fechaHasta, tipoHabitacionId, capacidadMinima }) {
  return reservasServicio.consultarDisponibilidad({
    fechaDesde: hoyComoFechaISO(),
    fechaHasta,
    tipoHabitacionId,
    capacidadMinima,
  });
}

// --------------------------------------------------------------
// HU-44 — check-in walk-in: crea la reserva y confirma el check-in en un
// solo paso, reusando el alta de Reservas (HU-36) tal cual.
// --------------------------------------------------------------

// Etapa 4A (HU-95, ajuste A) — el plan tarifario es UNO por reserva (no por
// habitación, misma regla que el wizard de HU-36/40): `planTarifarioId` y
// `totalEsperado` viajan a nivel reserva, `habitaciones` trae solo la
// ocupación de cada una (adultos/menores).
async function registrarCheckInWalkIn({
  personas,
  operador,
  fechaHasta,
  habitaciones,
  planTarifarioId,
  totalEsperado,
  huesped,
  garantiaConfirmada,
  medioGarantia,
  referenciaGarantia,
}) {
  validarGarantia({ garantiaConfirmada, medioGarantia, referenciaGarantia });

  // Mismo alta que HU-36 (recepcionista) — la "reserva inmediata" que pide
  // la tarea técnica de HU-44 no es un modelo aparte, es una Reserva común
  // que arranca hoy. `normalizarAltaReserva` valida el rango de fechas, el
  // huésped, el plan y las habitaciones (con ocupación) exactamente igual
  // que un alta asistida, y compara el precio contra `totalEsperado` con
  // el mismo motor (HU-96).
  const datos = reservasServicio.normalizarAltaReserva({
    fechaDesde: hoyComoFechaISO(),
    fechaHasta,
    habitaciones,
    planTarifarioId,
    totalEsperado,
    huesped,
    origen: "RECEPCION",
  });

  const reservaId = await prisma.$transaction(
    async (tx) => {
      // El walk-in ya trae todos los ocupantes completos; no crear un borrador adicional.
      const reserva = await reservasServicio.crearReservaEnTransaccion(tx, datos, { incluirTitular: false });
      await require("../estadia/ingreso").cargarWalkIn(tx, reserva.id, personas, operador);
      await require("../estadia/ingreso").prepararIngreso(tx, reserva.id, operador);
      await reservasServicio.marcarEnCurso(reserva.id, tx);
      await ocuparHabitaciones(
        tx,
        datos.habitaciones.map((habitacion) => habitacion.habitacionId)
      );
      return reserva.id;
    },
    OPCIONES_TRANSACCION
  );

  await registrarGarantia(reservaId, { medioGarantia, referenciaGarantia });

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
