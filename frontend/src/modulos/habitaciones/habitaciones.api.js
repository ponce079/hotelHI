import { api } from "../../lib/api";

export async function listarHabitaciones(params = {}) {
  const { data } = await api.get("/habitaciones", { params });
  return data;
}

export async function obtenerHabitacion(id) {
  const { data } = await api.get(`/habitaciones/${id}`);
  return data;
}

export async function crearHabitacion(payload) {
  const { data } = await api.post("/habitaciones", payload);
  return data;
}

export async function actualizarHabitacion(id, payload) {
  const { data } = await api.put(`/habitaciones/${id}`, payload);
  return data;
}

export async function actualizarEstadoHabitacion(id, estado, motivoBloqueo) {
  const { data } = await api.patch(`/habitaciones/${id}/estado`, { estado, motivoBloqueo });
  return data;
}

export async function cambiarActivoHabitacion(id, activo) {
  const { data } = await api.patch(`/habitaciones/${id}/activo`, { activo });
  return data;
}

export async function crearOrdenMantenimiento(habitacionId, payload) {
  const { data } = await api.post(`/habitaciones/${habitacionId}/mantenimiento`, payload);
  return data;
}

export async function listarOrdenesMantenimiento(params = {}) {
  const { data } = await api.get("/habitaciones/mantenimiento", { params });
  return data;
}

export async function resolverOrdenMantenimiento(ordenId, resueltaPor) {
  const { data } = await api.patch(`/habitaciones/mantenimiento/${ordenId}/resolver`, { resueltaPor });
  return data;
}
