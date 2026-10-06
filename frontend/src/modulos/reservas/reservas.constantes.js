// Mismas listas fijas que backend/src/modulos/reservas/reservas.constantes.js,
// duplicadas a mano (misma convención que habitaciones y comprobantes: el
// frontend no importa nada del backend). Excepción explícita: MAX_NOCHES_ESTADIA
// SÍ se importa del módulo de tarifas — es la misma constante que usa el
// motor de cotización, no una lista fija propia de Reservas (Etapa 4A).
import { MAX_NOCHES_ESTADIA } from "../tarifas/tarifas.constantes";

export const ESTADO_RESERVA = {
  CONFIRMADA: "Confirmada",
  EN_CURSO: "En curso",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
  // El huésped no llegó (garantía con tarjeta): cobra la penalidad del plan y
  // libera las habitaciones. Mismo valor que el backend.
  NO_SHOW: "No-show",
};

export const ESTADOS_RESERVA = [
  ESTADO_RESERVA.CONFIRMADA,
  ESTADO_RESERVA.EN_CURSO,
  ESTADO_RESERVA.CERRADA,
  ESTADO_RESERVA.CANCELADA,
  ESTADO_RESERVA.NO_SHOW,
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
  // No-show: salida del camino con consecuencia económica (alerta, no error).
  [ESTADO_RESERVA.NO_SHOW]: "alerta",
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
  // Latón (mismo tono que el Badge "alerta"): distinto de Cancelada para no mezclarlos.
  [ESTADO_RESERVA.NO_SHOW]: { fondo: "#eadfc2", texto: "#6b5420", borde: "#d4c28c" },
};

// Catálogo único de huésped y ocupantes (lib/tiposDocumento.js).
export { TIPOS_DOCUMENTO } from "../../lib/tiposDocumento";

export const CANALES_CONFIRMACION = ["Email"];

export const LIMITES_RESERVA = {
  nombre: 120,
  nombres: 80,
  apellido: 80,
  numeroDocumento: 30,
  contacto: 190,
  preferencias: 2000,
  motivoCancelacion: 300,
  habitacionesPorReserva: 20,
  // Etapa 4A: mismo tope que el motor de cotización (MAX_NOCHES_ESTADIA).
  nochesPorReserva: MAX_NOCHES_ESTADIA,
};

// Mismo mensaje que el backend (reservas.servicio.js / cotizacion.servicio.js)
// para que el frontend frene ANTES de mandar el pedido, con el mismo texto.
export const MENSAJE_ESTADIA_LARGA = `Las estadías de más de ${MAX_NOCHES_ESTADIA} noches requieren una tarifa de larga estadía: consultá con gerencia.`;

// (La seña obligatoria del 20 % de HU-36/88 se retiró: la reemplaza la garantía con tarjeta de crédito
// — ver modulos/garantias/ — y su único valor, PORCENTAJE_SENIA_RESERVA, ya no existe.)

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
  const noShow = reserva?.estado === ESTADO_RESERVA.NO_SHOW;
  const indicePorEstado = {
    [ESTADO_RESERVA.CONFIRMADA]: 0,
    [ESTADO_RESERVA.EN_CURSO]: 1,
    [ESTADO_RESERVA.CERRADA]: 2,
    // Una reserva cancelada llegó a estar confirmada: el primer nodo sigue
    // siendo el punto real donde quedó, y la X aparte cuenta el resto.
    [ESTADO_RESERVA.CANCELADA]: 0,
    [ESTADO_RESERVA.NO_SHOW]: 0,
  };
  return {
    pasos: PASOS_RESERVA,
    pasoActual: indicePorEstado[reserva?.estado] ?? 0,
    pasoAlternativo: { label: noShow ? "No-show" : "Cancelada", activo: cancelada || noShow },
  };
}
