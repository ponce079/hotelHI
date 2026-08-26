import { api } from "../../lib/api";

export async function consultarStock(params) {
  const { data } = await api.get("/stock", { params });
  return data;
}

export async function actualizarParametrosStock(articuloDepositoId, payload) {
  const { data } = await api.patch(`/stock/${articuloDepositoId}`, payload);
  return data;
}