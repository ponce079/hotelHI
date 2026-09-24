// Reservas (HU-36 a HU-42) — listas fijas validadas en código, mismo
// criterio que habitaciones.constantes.js y proveedores.constantes.js (el
// schema guarda String suelto, la lista válida vive acá y se duplica a
// mano en frontend/src/modulos/reservas/reservas.constantes.js).

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

// Tipos de documento aceptados para la ficha del huésped (HU-39).
const TIPOS_DOCUMENTO = ["DNI", "Pasaporte", "Cédula de identidad", "Libreta cívica", "Libreta de enrolamiento"];

// Canal de la confirmación automática (HU-41). El modelo Notificacion
// admite además "Interno" (ver habitaciones.constantes.js), que acá se usa
// como fallback cuando el huésped no dejó datos de contacto — ver
// armarNotificacionConfirmacion en reservas.servicio.js.
const CANALES_CONFIRMACION = ["Email", "SMS"];
const CANAL_INTERNO = "Interno";

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
  numeroDocumento: 30,
  contacto: 120,
  preferencias: 2000,
  motivoCancelacion: 300,
  // Tope defensivo de una reserva grupal: evita que un payload con 500
  // habitaciones bloquee media tabla dentro de la transacción.
  habitacionesPorReserva: 20,
  // Tope de la estadía, para que un error de tipeo en el año
  // (2026 → 2062) no inmovilice una habitación por décadas.
  nochesPorReserva: 365,
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
  CANAL_INTERNO,
  DESTINATARIO_HUESPED,
  DESTINATARIO_RECEPCION,
  TIPO_NOTIFICACION_RESERVA,
  LIMITES_RESERVA,
  MAX_INTENTOS_CODIGO,
  LONGITUD_CODIGO_BYTES,
  ZONA_ARGENTINA,
};
