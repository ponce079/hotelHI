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
