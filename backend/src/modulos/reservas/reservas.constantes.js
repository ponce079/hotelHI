// Reservas (HU-36 a HU-42) — listas fijas validadas en código, mismo
// criterio que habitaciones.constantes.js y proveedores.constantes.js (el
// schema guarda String suelto, la lista válida vive acá y se duplica a
// mano en frontend/src/modulos/reservas/reservas.constantes.js).

// Etapa 4A de tarifas por temporada: el tope de noches de una reserva
// pasa a ser el MISMO que el del motor de cotización (cotizarEstadia ya
// rechaza cualquier estadía de más de MAX_NOCHES_ESTADIA noches) — antes
// acá había un tope propio de 365 noches, que quedaba sin efecto real
// desde que toda reserva pasa por el motor. Import modulos/ -> modulos/
// (no lib/), sin ciclo: tarifas.constantes.js no importa nada de reservas.
const { MAX_NOCHES_ESTADIA } = require("../tarifas/tarifas.constantes");

const ESTADO_RESERVA = {
  CONFIRMADA: "Confirmada",
  EN_CURSO: "En curso",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
};

const ESTADOS_RESERVA = [
  ESTADO_RESERVA.CONFIRMADA,
  ESTADO_RESERVA.EN_CURSO,
  ESTADO_RESERVA.CERRADA,
  ESTADO_RESERVA.CANCELADA,
];

// Qué estados bloquean una habitación para el cálculo de disponibilidad
// (HU-36/37/38). Decisión explícita, no es "todos menos Cancelada":
//   - Cancelada libera el período — lo pide textual el criterio de
//     aceptación de HU-37.
//   - Cerrada también libera: el check-out ya ocurrió y el huésped se fue.
//     Si se fue antes de fechaHasta (check-out anticipado, HU-48 a 52 de
//     Integrante 4), la habitación queda realmente libre desde ese momento
//     aunque el rango original diga otra cosa — seguir bloqueándola sería
//     invendible por un dato que ya no describe la realidad.
//   - Confirmada y En curso sí ocupan, pero NO de la misma forma: ver
//     condicionSolapamiento en reservas.servicio.js — Confirmada usa su
//     fechaHasta tal cual (todavía no empezó), En curso bloquea sin techo
//     desde su fechaDesde porque, sin un check-out real, no hay forma de
//     confiar en que la fechaHasta original vaya a describir cuándo el
//     huésped se fue.
const ESTADOS_QUE_OCUPAN = [ESTADO_RESERVA.CONFIRMADA, ESTADO_RESERVA.EN_CURSO];

// Tipos de documento aceptados para la ficha del huésped (HU-39): el catálogo único que
// comparten huésped y ocupantes vive en lib/tiposDocumento.js.
const { TIPOS_DOCUMENTO } = require("../../lib/tiposDocumento");

// Canal de la confirmación automática (HU-41). El modelo Notificacion
// admite además "Interno" (ver habitaciones.constantes.js), que acá se usa
// como fallback cuando el huésped no dejó datos de contacto — ver
// armarNotificacionConfirmacion en reservas.servicio.js.
const CANALES_CONFIRMACION = ["Email"];

// Notificacion.destinatarioArea es NOT NULL y describe a quién le llega el
// aviso: una confirmación por Email/SMS va al huésped, y el fallback
// interno queda para el mostrador.
const DESTINATARIO_HUESPED = "Huésped";
const DESTINATARIO_RECEPCION = "Recepción";

// Notificacion.tipo — valor propio de este módulo dentro de la tabla
// polimórfica compartida con Habitaciones (Mantenimiento) y Check-out.
const TIPO_NOTIFICACION_RESERVA = "Reserva";

const LIMITES_RESERVA = {
  nombre: 120,
  nombres: 80,
  apellido: 80,
  numeroDocumento: 30,
  contacto: 190,
  preferencias: 2000,
  motivoCancelacion: 300,
  // Tope defensivo de una reserva grupal: evita que un payload con 500
  // habitaciones bloquee media tabla dentro de la transacción.
  habitacionesPorReserva: 20,
  // Etapa 4A: mismo tope que el motor de cotización (MAX_NOCHES_ESTADIA,
  // tarifas.constantes.js) — antes era un valor propio de 365 noches, sin
  // efecto real desde que toda reserva se cotiza con el motor.
  nochesPorReserva: MAX_NOCHES_ESTADIA,
};

// HU-42: código alfanumérico aleatorio, no correlativo — 4 bytes en hex
// dan 8 caracteres (~4.300 millones de combinaciones), de sobra para que
// una colisión sea anecdótica. El tope de reintentos existe igual, por si
// se da.
const MAX_INTENTOS_CODIGO = 5;
const LONGITUD_CODIGO_BYTES = 4;

// Misma zona de referencia que frontend/src/lib/fechas.js: "hoy" nunca es
// la hora del proceso ni UTC a secas.
const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

module.exports = {
  ESTADO_RESERVA,
  ESTADOS_RESERVA,
  ESTADOS_QUE_OCUPAN,
  TIPOS_DOCUMENTO,
  CANALES_CONFIRMACION,
  DESTINATARIO_HUESPED,
  DESTINATARIO_RECEPCION,
  TIPO_NOTIFICACION_RESERVA,
  LIMITES_RESERVA,
  MAX_INTENTOS_CODIGO,
  LONGITUD_CODIGO_BYTES,
  ZONA_ARGENTINA,
};
