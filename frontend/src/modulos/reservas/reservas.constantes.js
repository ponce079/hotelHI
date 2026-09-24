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
