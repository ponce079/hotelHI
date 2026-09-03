import { api } from "../../lib/api";

export async function listarRequerimientos(params) {
  const { data } = await api.get("/requerimientos", { params });
  return data;
}

export async function obtenerRequerimiento(id) {
  const { data } = await api.get(`/requerimientos/${id}`);
  return data;
}

export async function crearRequerimiento(payload) {
  const { data } = await api.post("/requerimientos", payload);
  return data;
}

// HU-82 — invitar proveedores a cotizar. Cuelga del requerimiento porque
// la acción es sobre él (pasa a "En cotización"), aunque lo que crea son
// filas de Presupuesto.
export async function solicitarPresupuestos(requerimientoId, payload) {
  const { data } = await api.post(`/requerimientos/${requerimientoId}/solicitar-presupuestos`, payload);
  return data;
}
