// src/lib/fechas.js
//
// "Hoy" en hora argentina (UTC-3 fijo, sin horario de verano desde 2009),
// nunca la hora del proceso ni UTC a secas — mismo criterio que
// frontend/src/lib/fechas.js. Vive en lib/ (no en reservas.constantes.js,
// que también define su propia copia del literal) porque desde HU-89
// también lo necesita habitaciones.servicio.js para la regla de "reserva
// vigente" al cambiar el tipo de una habitación: importarlo directo desde
// reservas.servicio.js cerraría un ciclo de require con lib/tipoHabitacion.js
// (ver el comentario ahí). reservas.servicio.js pasa a importar esta copia
// en vez de tener la suya local.

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

function hoyComoFechaUTC() {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
  return new Date(`${hoy}T00:00:00.000Z`);
}

module.exports = { ZONA_ARGENTINA, hoyComoFechaUTC };
