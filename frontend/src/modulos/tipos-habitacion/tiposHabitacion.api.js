import { api } from "../../lib/api";

export async function listarTiposHabitacion(params = {}) {
  const { data } = await api.get("/tipos-habitacion", { params });
  return data;
}

export async function obtenerTipoHabitacion(id) {
  const { data } = await api.get(`/tipos-habitacion/${id}`);
  return data;
}

export async function crearTipoHabitacion(payload) {
  const { data } = await api.post("/tipos-habitacion", payload);
  return data;
}

export async function actualizarTipoHabitacion(id, payload) {
  const { data } = await api.put(`/tipos-habitacion/${id}`, payload);
  return data;
}

export async function cambiarActivoTipoHabitacion(id, activo) {
  const { data } = await api.patch(`/tipos-habitacion/${id}/activo`, { activo });
  return data;
}
