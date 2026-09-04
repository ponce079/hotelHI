import { api } from "../../lib/api";

export async function listarProveedores(params) {
  const { data } = await api.get("/proveedores", { params });
  return data;
}

// Array plano de proveedores activos, para combos y grillas de selección
// (invitar a cotizar). No pagina.
export async function listarProveedoresActivos(params) {
  const { data } = await api.get("/proveedores", { params: { ...params, activos: "1" } });
  return data;
}

export async function obtenerProveedor(id) {
  const { data } = await api.get(`/proveedores/${id}`);
  return data;
}

export async function crearProveedor(payload) {
  const { data } = await api.post("/proveedores", payload);
  return data;
}

export async function actualizarProveedor(id, payload) {
  const { data } = await api.put(`/proveedores/${id}`, payload);
  return data;
}

export async function cambiarEstadoProveedor(id, activo) {
  const { data } = await api.patch(`/proveedores/${id}/estado`, { activo });
  return data;
}

export async function listarOrdenesCompraDeProveedor(id, params) {
  const { data } = await api.get(`/proveedores/${id}/ordenes-compra`, { params });
  return data;
}
