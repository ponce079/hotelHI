import { api } from "../../lib/api";

export async function registrarEntrada(payload) {
  const { data } = await api.post("/movimientos-stock/entrada", payload);
  return data;
}

export async function registrarSalida(payload) {
  const { data } = await api.post("/movimientos-salida/salida", payload);
  return data;
}

export async function listarMovimientos(params) {
  const { data } = await api.get("/movimientos-stock", { params });
  return data;
}

export async function registrarTransferencia(payload) {
  const { data } = await api.post("/movimientos-stock/transferencia", payload);
  return data;
}

export async function confirmarRecepcion(id, payload) {
  const { data } = await api.post(`/movimientos-stock/${id}/recepcion`, payload);
  return data;
}

export async function marcarDiferenciaRevisada(id, payload) {
  const { data } = await api.post(`/movimientos-stock/${id}/revisar-diferencia`, payload);
  return data;
}

export async function pedirFaltantesPorDiferencia(id, payload) {
  const { data } = await api.post(`/movimientos-stock/${id}/pedir-faltantes`, payload);
  return data;
}
