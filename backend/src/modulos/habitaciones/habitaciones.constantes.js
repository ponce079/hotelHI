const ESTADOS_HABITACION = ["libre", "ocupada", "mantenimiento", "bloqueada", "en limpieza"];
const TIPOS_TAREA_MANTENIMIENTO = ["Correctivo", "Preventivo"];

const LIMITES_HABITACION = {
  numero: 20,
  tipo: 60,
  equipamiento: 2000,
  responsable: 100,
  // Mismo límite que Reserva.motivoCancelacion (reservas.constantes.js).
  motivoBloqueo: 300,
};

module.exports = {
  ESTADOS_HABITACION,
  TIPOS_TAREA_MANTENIMIENTO,
  LIMITES_HABITACION,
};
