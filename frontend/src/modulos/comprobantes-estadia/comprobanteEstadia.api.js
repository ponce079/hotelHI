import { api } from "../../lib/api";

// HU-53 / HU-55 — payload: { reservaId, importeTotal, alicuotaIVA,
// razonSocialTercero?, cuitTercero? }. `importeTotal` es el precio final con
// IVA incluido: el backend calcula neto e IVA. (El backend también acepta
// `importeNeto`, pero se manda uno solo de los dos.)
export async function emitirComprobanteEstadia(payload) {
  const { data } = await api.post("/comprobantes-estadia", payload);
  return data;
}

// Comprobantes de una reserva (más nuevos primero), con sus notas de crédito
// en `ajustes`.
export async function listarComprobantesReserva(reservaId) {
  const { data } = await api.get("/comprobantes-estadia", { params: { reservaId } });
  return data;
}

// Listado general. params (todos opcionales): { q, tipo, desde, hasta } —
// desde/hasta en YYYY-MM-DD sobre la fecha de emisión.
export async function listarComprobantes(params = {}) {
  const { data } = await api.get("/comprobantes-estadia", { params });
  return data;
}

// Incluye reserva (con huésped), comprobanteRelacionado y ajustes (notas de crédito).
export async function obtenerComprobante(id) {
  const { data } = await api.get(`/comprobantes-estadia/${id}`);
  return data;
}

// HU-56 — payload: { importeTotal, alicuotaIVA, motivo }.
export async function crearNotaCredito(comprobanteId, payload) {
  const { data } = await api.post(`/comprobantes-estadia/${comprobanteId}/nota-credito`, payload);
  return data;
}

// HU-53 — baja lógica. Solo si no tiene notas de crédito vigentes.
export async function anularComprobante(id) {
  const { data } = await api.post(`/comprobantes-estadia/${id}/anular`);
  return data;
}

// HU-54 — fecha en YYYY-MM-DD.
export async function obtenerReporteCajaDiaria(fecha) {
  const { data } = await api.get("/comprobantes-estadia/reporte-caja-diaria", { params: { fecha } });
  return data;
}
