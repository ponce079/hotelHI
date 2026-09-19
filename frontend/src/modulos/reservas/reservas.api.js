import { api } from "../../lib/api";

export async function listarReservas(params = {}) {
  const { data } = await api.get("/reservas", { params });
  return data;
}

export async function obtenerReserva(id) {
  const { data } = await api.get(`/reservas/${id}`);
  return data;
}

// HU-43 (Check-in) entra por acá cuando el huésped llega con su código.
export async function obtenerReservaPorCodigo(codigo) {
  const { data } = await api.get(`/reservas/codigo/${encodeURIComponent(codigo)}`);
  return data;
}

// HU-38 — no requiere sesión de staff: la consumen también las pantallas
// públicas (/disponibilidad y /reservar).
export async function consultarDisponibilidad(params) {
  const { data } = await api.get("/reservas/disponibilidad", { params });
  return data;
}

// HU-36 (recepcionista) y HU-40 (autoservicio web) usan este mismo alta;
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
