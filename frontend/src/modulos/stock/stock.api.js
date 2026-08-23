import { api } from "../../lib/api";

export async function listarStock(filtros = {}) {
  const { data } = await api.get("/stock", { params: filtros });
  return data;
}