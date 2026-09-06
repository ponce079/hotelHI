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

// HU-81 — editar. Solo mientras el requerimiento está "Pendiente" (el
// backend es el que manda esa regla).
export async function actualizarRequerimiento(id, payload) {
  const { data } = await api.put(`/requerimientos/${id}`, payload);
  return data;
}

// HU-81 — anular (baja lógica, nunca DELETE). Mismo criterio que
// anularOrdenCompra en ordenesCompra.api.js.
export async function anularRequerimiento(id, motivo) {
  const { data } = await api.post(`/requerimientos/${id}/anular`, { motivo });
  return data;
}

// HU-82 — invitar proveedores a cotizar. Cuelga del requerimiento porque
// la acción es sobre él (pasa a "En cotización"), aunque lo que crea son
// filas de Presupuesto.
export async function solicitarPresupuestos(requerimientoId, payload) {
  const { data } = await api.post(`/requerimientos/${requerimientoId}/solicitar-presupuestos`, payload);
  return data;
}
