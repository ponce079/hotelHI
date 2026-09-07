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

// Punto 9 — respaldo documental (PDF/imagen) del presupuesto. `archivo` es
// un File del input — axios arma el multipart y el boundary solo con
// pasarle un FormData, no hace falta setear el Content-Type a mano.
export async function subirAdjuntoPresupuesto(id, archivo) {
  const formData = new FormData();
  formData.append("archivo", archivo);
  const { data } = await api.post(`/presupuestos/${id}/adjunto`, formData);
  return data;
}

export async function eliminarAdjuntoPresupuesto(id) {
  await api.delete(`/presupuestos/${id}/adjunto`);
}

// No se usa con axios (data URL de descarga) — el link del adjunto navega
// directo a esta URL relativa, el navegador la resuelve con la sesión
// actual igual que cualquier otro link de la página.
export function urlAdjuntoPresupuesto(id) {
  return `/api/presupuestos/${id}/adjunto`;
}
