// Límite de cancelación sin cargo de un plan reembolsable: la fecha de llegada a la hora de check-in
// (HORA_CHECKIN, hora argentina) menos las horas de anticipación del plan. Función pura, sin base: la
// usan calcularPenalidad (penalidades.servicio.js) y el email de confirmación del e-commerce, para que
// los dos digan exactamente lo mismo.
const { combinarFechaConHoraArgentina, parsearFechaSinHora } = require("../../lib/fechas");
const { HORA_CHECKIN } = require("./tarifas.constantes");

// fechaDesde: Date (medianoche UTC del día de llegada) o "AAAA-MM-DD". Devuelve un Date.
function calcularLimiteSinCargo(fechaDesde, horasCancelacionSinCargo) {
  const llegada = combinarFechaConHoraArgentina(parsearFechaSinHora(fechaDesde, "fechaDesde"), HORA_CHECKIN.hora, HORA_CHECKIN.minuto);
  return new Date(llegada.getTime() - Number(horasCancelacionSinCargo ?? 0) * 60 * 60 * 1000);
}

module.exports = { calcularLimiteSinCargo };
