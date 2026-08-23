import { api } from "../../lib/api";

export async function consultarStock(params) {
  const { data } = await api.get("/stock", { params });
  return data;
}