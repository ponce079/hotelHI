// Capa de API del e-commerce (/api/web). Contrato: docs/ecommerce/CONTRATO.md.
// Con VITE_ECOMMERCE_MOCK=true responde ecommerce.mock.js (misma forma).
// Todos los errores salen normalizados a { codigo, mensaje, status, ...extra }.
// Solo Gimena cambia este archivo.
import { api } from "../../lib/api";
import { CODIGO_ERROR } from "./ecommerce.constantes";
import {
  mockCancelarMiReserva,
  mockConsultarDisponibilidad,
  mockConsultarMiReserva,
  mockCotizar,
  mockCrearReserva,
  mockObtenerTipos,
} from "./ecommerce.mock";

// Tope de espera para crear la reserva (incluye la pasarela). Si se corta,
// el error es ERROR_RED y se reintenta con la MISMA clave de idempotencia.
const TIMEOUT_RESERVA_MS = 45000;

export function usarMock() {
  return import.meta.env.VITE_ECOMMERCE_MOCK === "true";
}

export function normalizarError(err) {
  // Errores del mock: ya vienen normalizados.
  if (err && typeof err === "object" && typeof err.codigo === "string" && !err.isAxiosError) return err;

  const respuesta = err?.response;
  if (!respuesta) {
    return { codigo: CODIGO_ERROR.ERROR_RED, mensaje: "No hubo respuesta del servidor.", status: 0 };
  }
  const datos = respuesta.data && typeof respuesta.data === "object" ? respuesta.data : {};
  const { error: mensaje, codigo, ...extra } = datos;
  // Una respuesta sin `codigo` no es del contrato (ej. un 502 del proxy o un
  // limitador de pedidos): se trata como no definitiva, así un reintento
  // nunca cambia la clave de idempotencia por error.
  const codigoSinContrato = respuesta.status === 429 ? CODIGO_ERROR.DEMASIADOS_INTENTOS : CODIGO_ERROR.ERROR_INTERNO;
  return {
    ...extra,
    codigo: codigo ?? codigoSinContrato,
    mensaje: mensaje ?? "Error inesperado.",
    status: respuesta.status,
  };
}

async function llamar(conMock, conApi) {
  try {
    if (usarMock()) return await conMock();
    const { data } = await conApi();
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

export function obtenerTipos() {
  return llamar(mockObtenerTipos, () => api.get("/web/tipos"));
}

// params: { fechaDesde, fechaHasta, adultos, menores }
export function consultarDisponibilidad(params) {
  return llamar(
    () => mockConsultarDisponibilidad(params),
    () => api.get("/web/disponibilidad", { params })
  );
}

// cuerpo: { fechaDesde, fechaHasta, planTarifarioId, habitaciones: [{ tipoHabitacionId, adultos, menores }] }
export function cotizar(cuerpo) {
  return llamar(
    () => mockCotizar(cuerpo),
    () => api.post("/web/cotizar", cuerpo)
  );
}

// cuerpo: ver CONTRATO.md → POST /api/web/reservas. Incluye la tarjeta: la
// página la pasa directo desde su estado local y la limpia después; nunca
// pasa por el contexto ni por ningún storage.
export function crearReserva(cuerpo) {
  return llamar(
    () => mockCrearReserva(cuerpo),
    () => api.post("/web/reservas", cuerpo, { timeout: TIMEOUT_RESERVA_MS })
  );
}

export function consultarMiReserva({ codigo, email }) {
  return llamar(
    () => mockConsultarMiReserva({ codigo, email }),
    () => api.post("/web/mi-reserva", { codigo, email })
  );
}

export function cancelarMiReserva({ codigo, email, montoPenalidadAceptado }) {
  return llamar(
    () => mockCancelarMiReserva({ codigo, email, montoPenalidadAceptado }),
    () => api.post("/web/mi-reserva/cancelar", { codigo, email, montoPenalidadAceptado })
  );
}
