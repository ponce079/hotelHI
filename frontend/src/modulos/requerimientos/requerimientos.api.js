import { api } from "../../lib/api";

export async function listarRequerimientos(params) {
  const { data } = await api.get("/requerimientos", { params });
  return data;
}

// Rediseño de la pantalla — los 4 contadores de las tarjetas de resumen.
// Mismos filtros de búsqueda/depósito/tipo que listarRequerimientos, pero
// nunca estado/categoría: son ellos los que se usan para filtrar por
// categoría al hacerles click.
export async function obtenerResumenRequerimientos(params) {
  const { data } = await api.get("/requerimientos/resumen", { params });
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

// Sprint 3 — confirma una sugerencia de reposición automática del central.
export async function confirmarSugerencia(id, usuario) {
  const { data } = await api.post(`/requerimientos/${id}/confirmar-sugerencia`, { usuario });
  return data;
}

// Sprint 3 — punto 9: compra express. Un proveedor + precios en un solo
// paso para un requerimiento COMPRA marcado urgente — salta la instancia
// de invitar a varios proveedores y esperar cotizaciones.
export async function compraExpress(id, payload) {
  const { data } = await api.post(`/requerimientos/${id}/compra-express`, payload);
  return data;
}
