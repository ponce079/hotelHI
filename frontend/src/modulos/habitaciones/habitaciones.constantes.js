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
export const CANALES_NOTIFICACION = ["Interno", "Email", "SMS"];

export const LIMITES_HABITACION = {
  numero: 20,
  tipo: 60,
  equipamiento: 2000,
  responsable: 100,
  mensaje: 2000,
};
