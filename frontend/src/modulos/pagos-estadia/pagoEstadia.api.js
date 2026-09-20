import { api } from "../../lib/api";

// { pagos: [{ id, fecha, estado, anulado, medios: [{ medioPago, importe }] }],
//   totalAdeudado, totalPagado, saldo }
export async function listarPagosEstadia(reservaId) {
  const { data } = await api.get("/pagos-estadia", { params: { reservaId } });
  return data;
}

// payload: { reservaId, medios: [{ tipo, importe }] }
export async function registrarPagoEstadia(payload) {
  const { data } = await api.post("/pagos-estadia", payload);
  return data;
}

export async function anularPagoEstadia(id, motivo) {
  const { data } = await api.post(`/pagos-estadia/${id}/anular`, { motivo });
  return data;
}
