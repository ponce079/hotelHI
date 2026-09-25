import { api } from "../../lib/api";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { ESTADO_RESERVA } from "./reservas.constantes";

export async function listarReservas(params = {}) {
  const { data } = await api.get("/reservas", { params });
  return data;
}

// A quién hay que hacerle check-in ahora: Confirmada con fecha de ingreso
// de hoy o anterior — mismo universo que admite validarReservaVigente en
// checkIn.servicio.js (no bloquea una llegada atrasada, solo una que
// todavía no llegó). Un solo lugar la calcula: la usan tanto "Llegadas de
// hoy" (RecepcionistaInicio.jsx) como la lista por defecto del buscador de
// Check-in (CheckInConReserva.jsx), para que no queden desincronizadas.
export async function listarLlegadasPendientes() {
  const confirmadas = await listarReservas({ estado: ESTADO_RESERVA.CONFIRMADA });
  const hoyUTC = Date.parse(`${hoyEnHoraLocal()}T00:00:00Z`);
  return confirmadas.filter((r) => {
    const desde = new Date(r.fechaDesde);
    const desdeUTC = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
    return desdeUTC <= hoyUTC;
  });
}

export async function obtenerReserva(id) {
  const { data } = await api.get(`/reservas/${id}`);
  return data;
}

// HU-43 (Check-in) entra por acá cuando el huésped llega con su código.
export async function obtenerReservaPorCodigo(codigo) {
  const { data } = await api.get(`/reservas/codigo/${encodeURIComponent(codigo)}`);
  return data;
}

// HU-38 — no requiere sesión de staff: la consumen también las pantallas
// públicas (/disponibilidad y /reservar).
export async function consultarDisponibilidad(params) {
  const { data } = await api.get("/reservas/disponibilidad", { params });
  return data;
}

// HU-36 (recepcionista, alta SIN seña — ya no la usa el wizard con seña
// obligatoria, ver crearReservaConSena) y HU-40 (autoservicio web, que
// nunca cobra seña) usan este mismo alta; solo cambia `origen` en el
// payload.
export async function crearReserva(payload) {
  const { data } = await api.post("/reservas", payload);
  return data;
}

// HU-88 (extensión) — alta de reserva CON seña en una sola operación
// atómica: reserva y PagoEstadia se crean juntos o no se crea nada (ver
// crearReservaConSena en reservas.servicio.js, backend). payload = los
// mismos campos de crearReserva + `medios` ([{ tipo, importe, referencia? }]),
// igual que le mandaría a registrarPagoEstadia.
export async function crearReservaConSena(payload) {
  const { data } = await api.post("/reservas/con-sena", payload);
  return data;
}

export async function modificarReserva(id, payload) {
  const { data } = await api.patch(`/reservas/${id}`, payload);
  return data;
}

export async function cancelarReserva(id, motivoCancelacion) {
  const { data } = await api.post(`/reservas/${id}/cancelar`, { motivoCancelacion });
  return data;
}
