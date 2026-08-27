import { api } from "../../lib/api";

export async function listarTiposMovimiento() {
  const { data } = await api.get("/tipos-movimiento");
  return data;
}

export async function crearTipoMovimiento(payload) {
  const { data } = await api.post("/tipos-movimiento", payload);
  return data;
}

export async function cambiarEstadoTipoMovimiento(id, activo) {
  const { data } = await api.patch(`/tipos-movimiento/${id}/estado`, { activo });
  return data;
}
