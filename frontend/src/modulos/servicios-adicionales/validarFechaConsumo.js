export function validarFechaConsumo(reserva, valor) {
  if (reserva.estado === 'Cerrada') return 'No se pueden registrar cargos sobre una reserva cerrada.';
  const fecha = valor ? new Date(valor) : new Date();
  if (!Number.isFinite(fecha.getTime())) return 'Fecha del servicio inválida.';
  const dia = fecha.toLocaleDateString('en-CA', {timeZone:'America/Argentina/Buenos_Aires'});
  const desde = reserva.fechaDesde?.slice(0,10), hasta = reserva.fechaHasta?.slice(0,10);
  if (desde && hasta && (dia < desde || dia > hasta)) return `La fecha del servicio debe estar dentro de la estadía (${desde} al ${hasta}).`;
  return '';
}
