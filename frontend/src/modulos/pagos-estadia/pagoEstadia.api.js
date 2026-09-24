import { api } from "../../lib/api";

// { pagos: [{ id, fecha, estado, anulado, medios: [{ medioPago, importe }] }],
//   totalAdeudado, totalPagado, saldo }
export async function listarPagosEstadia(reservaId) {
  const { data } = await api.get("/pagos-estadia", { params: { reservaId } });
  return data;
}

// payload: { reservaId, medios: [{ tipo, importe }], concepto? } — concepto
// es opcional (default "Pago final" del backend); la seña de reserva y la
// garantía en efectivo del check-in mandan el suyo.
export async function registrarPagoEstadia(payload) {
  const { data } = await api.post("/pagos-estadia", payload);
  return data;
}

// HU-88 — listado global (todas las reservas), a diferencia de
// listarPagosEstadia que trae los de una sola. params (todos opcionales):
// { q, concepto, desde, hasta }.
export async function listarMovimientosPago(params = {}) {
  const { data } = await api.get("/pagos-estadia/movimientos", { params });
  return data;
}

export async function anularPagoEstadia(id, motivo) {
  const { data } = await api.post(`/pagos-estadia/${id}/anular`, { motivo });
  return data;
}
