import { api } from "../../lib/api";

export async function listarHabilitaciones() {
  const { data } = await api.get("/articulo-depositos");
  return data;
}

export async function habilitarArticuloEnDeposito(payload) {
  const { data } = await api.post("/articulo-depositos", payload);
  return data;
}

export async function cambiarEstadoHabilitacion(id, activo) {
  const { data } = await api.patch(`/articulo-depositos/${id}/estado`, { activo });
  return data;
}
