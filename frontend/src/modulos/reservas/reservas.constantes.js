// Mismas listas fijas que backend/src/modulos/reservas/reservas.constantes.js,
// duplicadas a mano (misma convención que habitaciones y comprobantes: el
// frontend no importa nada del backend).

export const ESTADO_RESERVA = {
  CONFIRMADA: "Confirmada",
  EN_CURSO: "En curso",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
};

export const ESTADOS_RESERVA = [
  ESTADO_RESERVA.CONFIRMADA,
  ESTADO_RESERVA.EN_CURSO,
  ESTADO_RESERVA.CERRADA,
  ESTADO_RESERVA.CANCELADA,
];

// Mapeo a las variantes de <Badge>: Confirmada es un estado sano (ok),
// En curso es "pasando ahora" (info), Cerrada es un final con éxito fuera
// de circuito (cerrado, mismo criterio que una OC cerrada) y Cancelada es
// una salida del camino (error).
export const ESTADO_RESERVA_BADGE = {
  [ESTADO_RESERVA.CONFIRMADA]: "ok",
  [ESTADO_RESERVA.EN_CURSO]: "info",
  [ESTADO_RESERVA.CERRADA]: "cerrado",
  [ESTADO_RESERVA.CANCELADA]: "error",
};

// Tarjetas de estado de ReservasPage.jsx (chips clickeables, mismo patrón
// que ESTADO_HABITACION_COLOR/stat-chip de HabitacionesPage y los chips de
// HistorialMantenimientoPage): reusa tal cual los mismos 4 pares fondo/texto
// que ya usa Habitaciones para sus categorías semánticamente equivalentes —
// no es una paleta nueva. Confirmada ↔ ocupada (info), En curso ↔ libre
// (ok/pino), Cerrada ↔ en limpieza (neutro), Cancelada ↔ bloqueada (error).
export const ESTADO_RESERVA_COLOR = {
  [ESTADO_RESERVA.CONFIRMADA]: { fondo: "#cddde1", texto: "#2f4650", borde: "#a6c0c6" },
  [ESTADO_RESERVA.EN_CURSO]: { fondo: "#cfe4d8", texto: "#1f4d3a", borde: "#a9cdb7" },
  [ESTADO_RESERVA.CERRADA]: { fondo: "#ddd0b3", texto: "#5a5340", borde: "#c4b48d" },
  [ESTADO_RESERVA.CANCELADA]: { fondo: "#f2c6b9", texto: "#8f3322", borde: "#e4a08c" },
};

export const TIPOS_DOCUMENTO = [
  "DNI",
  "Pasaporte",
  "Cédula de identidad",
  "Libreta cívica",
  "Libreta de enrolamiento",
];

export const CANALES_CONFIRMACION = ["Email"];

export const LIMITES_RESERVA = {
  nombre: 120,
  numeroDocumento: 30,
  contacto: 190,
  preferencias: 2000,
  motivoCancelacion: 300,
  habitacionesPorReserva: 20,
};

// HU-36/88 — seña obligatoria al confirmar una reserva nueva desde el
// mostrador: 20% del total estimado de la estadía. Solo vive acá, en el
// frontend — el backend NO la valida como una regla propia de crearPago (que
// sigue aceptando cualquier importe hasta el saldo real, 100% del total):
// ReservaWizard.jsx arma el paso de cobro con `saldo` fijado a este 20% y
// `exigirTotal` en PagoEstadiaWizard, así que ese mismo cap (ni más ni menos)
// es lo único que ese paso deja confirmar. Si el día de mañana hace falta
// que el backend también la exija (ej. para blindar un POST directo a
// /pagos-estadia sin pasar por el wizard), ese 20% tendría que vivir en
// reservas.constantes.js (backend) y crearPago tendría que aprender a
// distinguir "esto es una seña" de un pago de check-out común — no es el
// caso hoy.
export const PORCENTAJE_SENIA_RESERVA = 0.2;

// Ciclo de vida para <PasoAPaso> / <MiniPasos>. "Cancelada" no es un paso
// más de la barra: es una bifurcación fuera del camino lineal, así que va
// como `pasoAlternativo` (mismo mecanismo que usa Requerimientos para sus
// salidas no lineales).
const PASOS_RESERVA = [
  { clave: "confirmada", label: "Confirmada" },
  { clave: "en-curso", label: "En curso" },
  { clave: "cerrada", label: "Cerrada", cerrado: true },
];

export function construirPasosReserva(reserva) {
  const cancelada = reserva?.estado === ESTADO_RESERVA.CANCELADA;
  const indicePorEstado = {
    [ESTADO_RESERVA.CONFIRMADA]: 0,
    [ESTADO_RESERVA.EN_CURSO]: 1,
    [ESTADO_RESERVA.CERRADA]: 2,
    // Una reserva cancelada llegó a estar confirmada: el primer nodo sigue
    // siendo el punto real donde quedó, y la X aparte cuenta el resto.
    [ESTADO_RESERVA.CANCELADA]: 0,
  };
  return {
    pasos: PASOS_RESERVA,
    pasoActual: indicePorEstado[reserva?.estado] ?? 0,
    pasoAlternativo: { label: "Cancelada", activo: cancelada },
  };
}
