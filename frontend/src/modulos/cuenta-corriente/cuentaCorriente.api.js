import { api } from "../../lib/api";

export async function obtenerResumenCuentaCorriente() {
  const { data } = await api.get("/cuenta-corriente/resumen");
  return data;
}

export async function obtenerCuentaCorrienteDeProveedor(proveedorId, params) {
  const { data } = await api.get(`/proveedores/${proveedorId}/cuenta-corriente`, { params });
  return data;
}
