const ESTADOS_HABITACION = ["libre", "ocupada", "mantenimiento", "bloqueada", "en limpieza"];
const TIPOS_TAREA_MANTENIMIENTO = ["Correctivo", "Preventivo"];
const CANALES_NOTIFICACION = ["Interno", "Email", "SMS"];

const LIMITES_HABITACION = {
  numero: 20,
  tipo: 60,
  equipamiento: 2000,
  responsable: 100,
  areaDestino: 100,
  mensaje: 2000,
};

module.exports = {
  ESTADOS_HABITACION,
  TIPOS_TAREA_MANTENIMIENTO,
  CANALES_NOTIFICACION,
  LIMITES_HABITACION,
};
