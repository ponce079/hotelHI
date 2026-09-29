import { api } from "../../lib/api";

// -------------------- Temporadas (HU-90) --------------------
export async function listarTemporadas(params = {}) {
  const { data } = await api.get("/tarifas/temporadas", { params });
  return data;
}

export async function obtenerCalendario(fechaDesde, fechaHasta) {
  const { data } = await api.get("/tarifas/temporadas/calendario", { params: { fechaDesde, fechaHasta } });
  return data;
}

export async function crearTemporada(payload) {
  const { data } = await api.post("/tarifas/temporadas", payload);
  return data;
}

export async function actualizarTemporada(id, payload) {
  const { data } = await api.put(`/tarifas/temporadas/${id}`, payload);
  return data;
}

export async function cambiarActivaTemporada(id, activa, motivoBaja, usuario) {
  const { data } = await api.patch(`/tarifas/temporadas/${id}/activa`, { activa, motivoBaja, usuario });
  return data;
}

// -------------------- Planes tarifarios (HU-91) --------------------
export async function listarPlanesTarifarios(params = {}) {
  const { data } = await api.get("/tarifas/planes", { params });
  return data;
}

export async function crearPlanTarifario(payload) {
  const { data } = await api.post("/tarifas/planes", payload);
  return data;
}

export async function actualizarPlanTarifario(id, payload) {
  const { data } = await api.put(`/tarifas/planes/${id}`, payload);
  return data;
}

export async function cambiarActivoPlanTarifario(id, activo, motivoBaja, usuario) {
  const { data } = await api.patch(`/tarifas/planes/${id}/activo`, { activo, motivoBaja, usuario });
  return data;
}

// -------------------- Precios / Tarifa (HU-92) --------------------
export async function obtenerGrillaTarifas() {
  const { data } = await api.get("/tarifas/precios/grilla");
  return data;
}

export async function obtenerHistorialTarifa(tipoHabitacionId, temporadaId) {
  const { data } = await api.get("/tarifas/precios", { params: { tipoHabitacionId, temporadaId } });
  return data;
}

export async function crearTarifa(payload) {
  const { data } = await api.post("/tarifas/precios", payload);
  return data;
}

export async function actualizarTarifa(id, payload) {
  const { data } = await api.put(`/tarifas/precios/${id}`, payload);
  return data;
}

export async function eliminarTarifa(id) {
  await api.delete(`/tarifas/precios/${id}`);
}

// -------------------- Modificador por día de semana --------------------
export async function listarModificadores() {
  const { data } = await api.get("/tarifas/modificadores");
  return data;
}

export async function actualizarModificador(diaSemana, porcentaje) {
  const { data } = await api.put(`/tarifas/modificadores/${diaSemana}`, { porcentaje });
  return data;
}

// -------------------- Actualización masiva por lote (HU-93) --------------------
export async function listarLotesActualizacion() {
  const { data } = await api.get("/tarifas/lotes");
  return data;
}

export async function calcularVistaPreviaLote(payload) {
  const { data } = await api.post("/tarifas/lotes/vista-previa", payload);
  return data;
}

export async function confirmarLote(payload) {
  const { data } = await api.post("/tarifas/lotes", payload);
  return data;
}

export async function anularLote(id, motivoAnulacion, usuario) {
  const { data } = await api.post(`/tarifas/lotes/${id}/anular`, { motivoAnulacion, usuario });
  return data;
}

// -------------------- Motor de cotización (HU-94) --------------------
export async function cotizarEstadia(payload) {
  const { data } = await api.post("/tarifas/cotizar", payload);
  return data;
}
