// src/lib/tipoHabitacion.js
//
// Aplana la relación Habitacion.tipoHabitacion en los mismos 2 campos
// "planos" que todo lector histórico de una Habitacion espera (HU-89): un
// campo `tipo` con el NOMBRE del tipo (compatibilidad con todo el código
// y los ~15 lugares de frontend que ya leen `habitacion.tipo` como string)
// más `tipoHabitacionId` para quien necesite filtrar/seleccionar por id.
//
// Vive en lib/ (no en habitaciones.servicio.js) a propósito: lo usan
// habitaciones.servicio.js, reservas.servicio.js y checkOut.servicio.js por
// igual, y si viviera en cualquiera de esos *.servicio.js los otros dos lo
// importarían de ahí — con habitaciones.servicio.js necesitando además
// hoyComoFechaUTC de reservas (ver lib/fechas.js) para la regla de reservas
// vigentes, eso cerraría un ciclo de require entre habitaciones.servicio.js
// y reservas.servicio.js. lib/ nunca importa nada de modulos/, así que
// nunca puede ser parte de un ciclo.
function conTipoPlano(habitacion) {
  return {
    tipo: habitacion.tipoHabitacion?.nombre ?? null,
    tipoHabitacionId: habitacion.tipoHabitacionId,
  };
}

module.exports = { conTipoPlano };
