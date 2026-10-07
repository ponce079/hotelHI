// Mismo límite que el backend (tarifas/limiteCancelacion.js): llegada a las 14:00 (hora argentina, UTC-3) menos las
// horas del plan. Si ya pasó, cancelar esta reserva cobra la primera noche: se avisa antes de elegir el plan.
const HORA_CHECKIN_ARGENTINA = 14;
const DESFASE_ARGENTINA_HORAS = 3;

export function yaDentroDelPlazoConCargo(fechaDesde, horasCancelacionSinCargo, ahora = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaDesde ?? ""));
  if (!m || horasCancelacionSinCargo == null) return false;
  const llegada = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), HORA_CHECKIN_ARGENTINA + DESFASE_ARGENTINA_HORAS);
  return ahora >= llegada - Number(horasCancelacionSinCargo) * 3600 * 1000;
}
