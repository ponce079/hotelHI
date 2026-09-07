import { api } from "../../lib/api";

export async function listarArticulos(params) {
  const { data } = await api.get("/articulos", { params });
  return data;
}

export async function obtenerArticulo(id) {
  const { data } = await api.get(`/articulos/${id}`);
  return data;
}

export async function crearArticulo(payload) {
  const { data } = await api.post("/articulos", payload);
  return data;
}

export async function actualizarArticulo(id, payload) {
  const { data } = await api.put(`/articulos/${id}`, payload);
  return data;
}

export async function cambiarEstadoArticulo(id, activo) {
  const { data } = await api.patch(`/articulos/${id}/estado`, { activo });
  return data;
}
