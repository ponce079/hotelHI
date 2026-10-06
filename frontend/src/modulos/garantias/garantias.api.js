import { api } from "../../lib/api";

// Qué pasaría al cancelar o marcar no-show ahora (retenido / devuelto / a
// cobrar a la tarjeta). Solo lectura: no escribe nada ni toca la pasarela.
// Es la MISMA liquidación que hace el backend al confirmar, así el aviso de
// la pantalla nunca puede desincronizarse de lo que realmente pasa.
export async function obtenerCierrePrevio(reservaId, tipo) {
  const { data } = await api.get(`/reservas/${reservaId}/cierre-previo`, { params: { tipo } });
  return data;
}

// Reservas Confirmadas cuya fecha de llegada ya pasó.
export async function listarNoShowPendientes() {
  const { data } = await api.get("/reservas/no-show-pendientes");
  return data;
}

// Cobra la penalidad del plan, deja la reserva en "No-show" y libera las
// habitaciones. La respuesta trae `penalidad` con el resultado del cobro.
export async function marcarNoShow(reservaId, motivo) {
  const { data } = await api.post(`/reservas/${reservaId}/no-show`, motivo ? { motivo } : {});
  return data;
}

// Resumen de las garantías de una reserva (sin token): { reserva, estadia }.
// `reserva.tieneTarjeta` dice si quedó una tarjeta guardada para preautorizar
// en el check-in sin volver a pedirla.
export async function obtenerGarantiasReserva(reservaId) {
  const { data } = await api.get(`/reservas/${reservaId}/garantia`);
  return data;
}

// Usa la garantía del check-in para cubrir el saldo en el check-out: captura la
// preautorización hasta el saldo (o aplica el depósito en efectivo) y la
// registra como pago. Devuelve { aplicado, medioPago, tipo, estado }.
export async function aplicarGarantiaAlSaldo(reservaId) {
  const { data } = await api.post(`/reservas/${reservaId}/garantia/aplicar`);
  return data;
}
