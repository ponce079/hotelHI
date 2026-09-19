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
