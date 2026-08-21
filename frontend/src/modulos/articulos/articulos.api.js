import { api } from "../../lib/api";

export async function listarArticulos() {
  const { data } = await api.get("/articulos");
  return data;
}

export async function crearArticulo(payload) {
  const { data } = await api.post("/articulos", payload);
  return data;
}
