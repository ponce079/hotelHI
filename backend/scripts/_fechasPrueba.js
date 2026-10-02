// Fechas de nacimiento de prueba SIEMPRE relativas a hoy (hora argentina): "hace N años", un día
// antes del cumpleaños para que ya los haya cumplido. Nunca años fijos: un "2015-01-01" deja de
// ser un menor de 12 con el paso del tiempo y la prueba cambia de sentido sin que nadie lo note.
const { hoyComoFechaUTC } = require("../src/lib/fechas");

function haceAnios(anios, diasExtra = 1) {
  const d = hoyComoFechaUTC();
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  d.setUTCDate(d.getUTCDate() - diasExtra);
  return d.toISOString().slice(0, 10);
}

// Fecha-sin-hora a N días de hoy (negativo = pasado).
function enDias(dias) {
  const d = hoyComoFechaUTC();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

module.exports = { haceAnios, enDias };
