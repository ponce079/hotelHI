import { api } from "../../lib/api";
import { TIMEOUT_OPERACION_MS } from "../../lib/tiempos";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { ESTADO_RESERVA } from "./reservas.constantes";

export async function listarReservas(params = {}) {
  const { data } = await api.get("/reservas", { params });
  return data;
}

// A quién hay que hacerle check-in ahora: Confirmada con fecha de ingreso
// de hoy o anterior — mismo universo que admite validarReservaVigente en
// checkIn.servicio.js (no bloquea una llegada atrasada, solo una que
// todavía no llegó). Un solo lugar la calcula: la usan tanto "Llegadas de
// hoy" (RecepcionistaInicio.jsx) como la lista por defecto del buscador de
// Check-in (CheckInConReserva.jsx), para que no queden desincronizadas.
export async function listarLlegadasPendientes() {
  const confirmadas = await listarReservas({ estado: ESTADO_RESERVA.CONFIRMADA });
  const hoyUTC = Date.parse(`${hoyEnHoraLocal()}T00:00:00Z`);
  return confirmadas.filter((r) => {
    const desde = new Date(r.fechaDesde);
    const desdeUTC = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
    return desdeUTC <= hoyUTC;
  });
}

export async function obtenerReserva(id) {
  const { data } = await api.get(`/reservas/${id}`);
  return data;
}

// HU-38 — disponibilidad en tiempo real (mostrador, con sesión).
export async function consultarDisponibilidad(params) {
  const { data } = await api.get("/reservas/disponibilidad", { params });
  return data;
}

// HU-95 (Etapa 4A) — cotización previa a confirmar un alta o una
// modificación: mismo payload que crearReserva pero sin totalEsperado, y
// nunca manda fechaVenta (el backend siempre usa la de hoy).
export async function cotizarReserva(payload) {
  const { data } = await api.post("/reservas/cotizar", payload);
  return data;
}

// Alta simple, SIN garantía: la usa HU-40 (autoservicio web, que nunca pide garantía y la
// reemplaza el e-commerce) y la edición. El alta de mostrador pasa por crearReservaConGarantia;
// solo cambia `origen` en el payload.
export async function crearReserva(payload) {
  const { data } = await api.post("/reservas", payload);
  return data;
}

export async function modificarReserva(id, payload) {
  const { data } = await api.patch(`/reservas/${id}`, payload);
  return data;
}

export async function cancelarReserva(id, motivoCancelacion) {
  const { data } = await api.post(`/reservas/${id}/cancelar`, { motivoCancelacion });
  return data;
}

// Etapa 4B (HU-97) — ajuste manual de precio (gerente). `usuario` no hace
// falta mandarlo: el backend lo ignora e igual usa el de la sesión
// autenticada (primer endpoint de reservas con auth real, ver
// reservas.routes.js).
export async function ajustarPrecioReserva(id, payload) {
  const { data } = await api.post(`/reservas/${id}/ajuste-precio`, payload);
  return data;
}

// Etapa 4B (HU-98) — cálculo de penalidad de solo lectura, no cobra nada.
export async function obtenerPenalidadReserva(id, tipo) {
  const { data } = await api.get(`/reservas/${id}/penalidad`, { params: { tipo } });
  return data;
}

// Historial de la reserva (solo lectura): ficha, confirmaciones, pagos, consumos y ajustes de precio,
// del más reciente al más antiguo. Cada evento: { id, fecha, tipo, titulo, detalle, operador }.
export async function obtenerHistorialReserva(id) {
  const { data } = await api.get(`/reservas/${id}/historial`);
  return data;
}

// Alta de reserva CON garantía (tarjeta de crédito o prepago): reemplaza a
// crearReservaConSena. El bloque `garantia.tarjeta` lleva el número y el CVV
// una sola vez; el backend los valida y los descarta (nunca se guardan).
export async function crearReservaConGarantia(datos) {
  const { data } = await api.post("/reservas/con-garantia", datos, { timeout: TIMEOUT_OPERACION_MS });
  return data;
}
