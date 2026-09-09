import { api } from '../../lib/api';

export async function listarComprobantes(params) {
  const { data } = await api.get('/comprobantes', { params });
  return data;
}

export async function obtenerComprobante(id) {
  const { data } = await api.get(`/comprobantes/${id}`);
  return data;
}

export async function crearComprobante(payload) {
  const { data } = await api.post('/comprobantes', payload);
  return data;
}

export async function crearComprobanteConAjustes(payload) {
  const { data } = await api.post('/comprobantes/con-ajustes', payload);
  return data;
}

export async function crearNota(comprobanteId, payload) {
  const { data } = await api.post(`/comprobantes/${comprobanteId}/nota`, payload);
  return data;
}

export async function anularComprobante(comprobanteId, motivo) {
  const { data } = await api.post(`/comprobantes/${comprobanteId}/anular`, { motivo });
  return data;
}