import { api } from "../../lib/api";
import { TIMEOUT_OPERACION_MS } from "../../lib/tiempos";

export async function buscarReservaParaCheckIn(params) {
  const { data } = await api.get("/check-in/buscar-reserva", { params });
  return data;
}

export async function listarHabitacionesLibresAhora(params) {
  const { data } = await api.get("/check-in/habitaciones-libres", { params });
  return data;
}

export async function confirmarCheckInConReserva(reservaId, payload) {
  const { data } = await api.post(`/check-in/${reservaId}/confirmar`, payload, { timeout: TIMEOUT_OPERACION_MS });
  return data;
}

export async function registrarCheckInWalkIn(payload) {
  const { data } = await api.post("/check-in/walk-in", payload, { timeout: TIMEOUT_OPERACION_MS });
  return data;
}

// GET /check-in/llegadas?q= — Confirmadas que ingresan hoy y aviso de anteriores sin ingreso.
export async function listarLlegadas(q = "") {
  const { data } = await api.get("/check-in/llegadas", { params: q ? { q } : {} });
  return data;
}

// POST /check-in/:id/previa-ocupacion — solo lectura: cuánto cambia el total.
export async function previaOcupacion(reservaId, habitaciones) {
  const { data } = await api.post(`/check-in/${reservaId}/previa-ocupacion`, { habitaciones });
  return data;
}

// GET /huespedes/por-documento — coincidencia exacta (persona que vuelve).
export async function buscarHuespedPorDocumento({ tipo, pais, numero }) {
  const { data } = await api.get("/huespedes/por-documento", { params: { tipo, pais, numero } });
  return data;
}

// GET /estadia/:id/ocupantes — fichas ya cargadas de la reserva (se precargan en las filas).
export async function listarOcupantes(reservaId) {
  const { data } = await api.get(`/estadia/${reservaId}/ocupantes`);
  return data;
}
