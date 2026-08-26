import { api } from "../../lib/api";

export async function listarDepositos() {
  const { data } = await api.get("/depositos");
  return data;
}

export async function obtenerDeposito(id) {
  const { data } = await api.get(`/depositos/${id}`);
  return data;
}

export async function crearDeposito(payload) {
  const { data } = await api.post("/depositos", payload);
  return data;
}

export async function actualizarDeposito(id, payload) {
  const { data } = await api.put(`/depositos/${id}`, payload);
  return data;
}
