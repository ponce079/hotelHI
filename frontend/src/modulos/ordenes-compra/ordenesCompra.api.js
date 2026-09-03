import { api } from "../../lib/api";

export async function listarOrdenesCompra(params) {
  const { data } = await api.get("/ordenes-compra", { params });
  return data;
}

export async function obtenerOrdenCompra(id) {
  const { data } = await api.get(`/ordenes-compra/${id}`);
  return data;
}

export async function aprobarOrdenCompra(id, usuario) {
  const { data } = await api.post(`/ordenes-compra/${id}/aprobar`, { usuario });
  return data;
}

export async function enviarOrdenCompra(id, usuario) {
  const { data } = await api.post(`/ordenes-compra/${id}/enviar`, { usuario });
  return data;
}

export async function anularOrdenCompra(id, motivo, usuario) {
  const { data } = await api.post(`/ordenes-compra/${id}/anular`, { motivo, usuario });
  return data;
}

export async function registrarRecepcionOC(id, detalle, usuario) {
  const { data } = await api.post(`/ordenes-compra/${id}/recepcion`, { detalle, usuario });
  return data;
}
