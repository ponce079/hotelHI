import { api } from "../../lib/api";

// HU-48 — cuenta consolidada de la reserva (alojamiento + servicios
// adicionales + cargos de verificación − pagos). Solo lectura.
export async function obtenerCuenta(reservaId) {
  const { data } = await api.get(`/check-out/${reservaId}/cuenta`);
  return data;
}

// HU-87 — devuelve { cargo, cuenta }: la cuenta ya viene recalculada.
export async function registrarVerificacion(reservaId, payload) {
  const { data } = await api.post(`/check-out/${reservaId}/verificaciones`, payload);
  return data;
}

// HU-49 / 51 / 52 — cierra la reserva, deja las habitaciones en limpieza y
// notifica a Housekeeping, todo en una sola transacción del backend.
export async function confirmarCheckOut(reservaId, payload) {
  const { data } = await api.post(`/check-out/${reservaId}/confirmar`, payload);
  return data;
}
