export const ESTADOS_HABITACION = ["libre", "ocupada", "mantenimiento", "bloqueada", "en limpieza"];

export const ESTADO_HABITACION_LABEL = {
  libre: "Libre",
  ocupada: "Ocupada",
  mantenimiento: "En mantenimiento",
  bloqueada: "Bloqueada",
  "en limpieza": "En limpieza",
};

export const ESTADO_HABITACION_BADGE = {
  libre: "ok",
  ocupada: "info",
  mantenimiento: "alerta",
  bloqueada: "error",
  "en limpieza": "neutro",
};

// Paleta específica del Panel de Habitaciones (mockup de referencia,
// Sprint 3): tinte fuerte de fondo por tarjeta, distinto de los tonos
// pastel de <Badge> (ESTADO_HABITACION_BADGE arriba, que se sigue usando
// en la tabla de otras pantallas) — acá el fondo entero de la tarjeta lleva
// el color, no un chip chico, así que necesita su propia rampa saturada.
export const ESTADO_HABITACION_COLOR = {
  libre: { fondo: "#cfe4d8", texto: "#1f4d3a", borde: "#a9cdb7" },
  ocupada: { fondo: "#cddde1", texto: "#2f4650", borde: "#a6c0c6" },
  mantenimiento: { fondo: "#f0dcab", texto: "#7c541f", borde: "#dfbd77" },
  bloqueada: { fondo: "#f2c6b9", texto: "#8f3322", borde: "#e4a08c" },
  "en limpieza": { fondo: "#ddd0b3", texto: "#5a5340", borde: "#c4b48d" },
};

// Tag "Sale hoy" (rojo) de la misma tarjeta — color fijo, no depende del
// estado (siempre es una alerta sobre una habitación "ocupada").
export const COLOR_SALE_HOY = { fondo: "#f7e4de", texto: "#8f3322" };

export const TIPOS_TAREA_MANTENIMIENTO = ["Correctivo", "Preventivo"];

// Espejo de TRANSICIONES_MANUALES_VALIDAS en habitaciones.servicio.js
// (backend) — mismo criterio de duplicar constantes ya usado en el resto
// del proyecto (el frontend no importa nada del backend). Son las
// transiciones que deja hacer el "Cambiar estado" manual del staff: no es
// la matriz completa del sistema, es la de esta puerta específica.
// "ocupada" (solo check-in real) y "mantenimiento" (solo
// crearOrdenMantenimiento, y solo se sale por resolverOrdenMantenimiento)
// nunca aparecen como destino ni de origen hacia otro lado por acá.
export const TRANSICIONES_MANUALES_VALIDAS = {
  libre: ["bloqueada", "en limpieza"],
  ocupada: [],
  mantenimiento: [],
  bloqueada: ["libre", "en limpieza"],
  "en limpieza": ["libre", "bloqueada"],
};

// Pendiente | Resuelta — reparto de responsabilidad: Housekeeping y
// Recepcionista reportan (crean la orden), solo Housekeeping resuelve.
export const ESTADO_ORDEN_MANTENIMIENTO_BADGE = {
  Pendiente: "alerta",
  Resuelta: "ok",
};

export const LIMITES_HABITACION = {
  numero: 20,
  equipamiento: 2000,
  responsable: 100,
  // Mismo límite que Reserva.motivoCancelacion (reservas.constantes.js).
  motivoBloqueo: 300,
};
