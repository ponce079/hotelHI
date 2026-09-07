import { api } from "../../lib/api";

export async function listarPresupuestos(params) {
  const { data } = await api.get("/presupuestos", { params });
  return data;
}

export async function obtenerPresupuesto(id) {
  const { data } = await api.get(`/presupuestos/${id}`);
  return data;
}

// HU-83 — cargar la cotización que mandó el proveedor.
export async function cargarPresupuesto(id, payload) {
  const { data } = await api.put(`/presupuestos/${id}/cargar`, payload);
  return data;
}

// HU-84 — adjudicar. Rechaza a los demás del mismo requerimiento y lo
// deja aprobado, todo en una transacción del lado del backend.
export async function aprobarPresupuesto(id, usuario) {
  const { data } = await api.post(`/presupuestos/${id}/aprobar`, { usuario });
  return data;
}
