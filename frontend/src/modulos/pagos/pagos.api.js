import { api } from "../../lib/api";

export async function listarProveedoresConSaldo() {
  const { data } = await api.get("/ordenes-pago/proveedores-con-saldo");
  return data;
}

export async function listarComprobantesPendientes(proveedorId) {
  const { data } = await api.get("/ordenes-pago/comprobantes-pendientes", { params: { proveedorId } });
  return data;
}

export async function crearOrdenPago(payload) {
  const { data } = await api.post("/ordenes-pago", payload);
  return data;
}

export async function obtenerOrdenPago(id) {
  const { data } = await api.get(`/ordenes-pago/${id}`);
  return data;
}

export async function listarOrdenesPago(params) {
  const { data } = await api.get("/ordenes-pago", { params });
  return data;
}

export async function anularOrdenPago(id, motivo, confirmarCheque) {
  const { data } = await api.patch(`/ordenes-pago/${id}/anular`, { motivo, confirmarCheque });
  return data;
}

export async function actualizarEstadoCheque(ordenPagoId, medioId, estado, fechaCobro) {
  const { data } = await api.patch(`/ordenes-pago/${ordenPagoId}/medios/${medioId}/estado-cheque`, {
    estado,
    fechaCobro,
  });
  return data;
}
