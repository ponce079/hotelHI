import { api } from "../../lib/api";

export async function buscarReservaParaCheckIn(params) {
  const { data } = await api.get("/check-in/buscar-reserva", { params });
  return data;
}

export async function listarHabitacionesLibresAhora(params) {
  const { data } = await api.get("/check-in/habitaciones-libres", { params });
  return data;
}

export async function sugerirHabitacion(params) {
  const { data } = await api.get("/check-in/sugerir-habitacion", { params });
  return data;
}

export async function confirmarCheckInConReserva(reservaId, payload) {
  const { data } = await api.post(`/check-in/${reservaId}/confirmar`, payload);
  return data;
}

export async function registrarCheckInWalkIn(payload) {
  const { data } = await api.post("/check-in/walk-in", payload);
  return data;
}
