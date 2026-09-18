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

export const TIPOS_TAREA_MANTENIMIENTO = ["Correctivo", "Preventivo"];
export const CANALES_NOTIFICACION = ["Interno", "Email", "SMS"];

export const LIMITES_HABITACION = {
  numero: 20,
  tipo: 60,
  equipamiento: 2000,
  responsable: 100,
  mensaje: 2000,
};
