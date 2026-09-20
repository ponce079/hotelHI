import { api } from "../../lib/api";

export async function registrarConsumo(payload) {
  const { data } = await api.post("/consumos-servicios", payload);
  return data;
}

export async function listarConsumosPorReserva(reservaId, params) {
  const { data } = await api.get("/consumos-servicios", { params: { reservaId, ...params } });
  return data;
}

export async function obtenerResumenPorReserva(reservaId) {
  const { data } = await api.get("/consumos-servicios/resumen", { params: { reservaId } });
  return data;
}

// Ajuste de flujo (Sprint 3): consulta de TODO el hotel por período, para
// la vista de solo lectura del menú "Servicios Adicionales" — el alta pasó
// a vivir únicamente en la ficha de la reserva (ver ReservaDetallePage.jsx).
export async function obtenerResumenHotel(params) {
  const { data } = await api.get("/consumos-servicios/hotel/resumen", { params });
  return data;
}
