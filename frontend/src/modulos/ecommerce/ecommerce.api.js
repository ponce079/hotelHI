// Capa de API del e-commerce (/api/web). Contrato: docs/ecommerce/CONTRATO.md.
// En desarrollo (npm run dev) y con VITE_ECOMMERCE_MOCK=true responde
// ecommerce.mock.js (misma forma). Un build de producción nunca usa el mock.
// Todos los errores salen normalizados a { codigo, mensaje, status, ...extra }.
// Solo Gimena cambia este archivo.
import { api } from "../../lib/api";
import { CODIGO_ERROR } from "./ecommerce.constantes";

// Tope de espera para crear la reserva (incluye la pasarela). Si se corta,
// el error es ERROR_RED y se reintenta con la MISMA clave de idempotencia.
const TIMEOUT_RESERVA_MS = 60000;

// `env` es parámetro solo para poder testear el caso de producción
// (DEV en false); en la app siempre es import.meta.env.
export function usarMock(env = import.meta.env) {
  return env.DEV === true && env.VITE_ECOMMERCE_MOCK === "true";
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

// `conMock` recibe el módulo del mock. Se importa en forma dinámica y detrás
// de un `import.meta.env.DEV` literal: en el build de producción Vite lo
// reemplaza por `false` y el mock (con sus datos de ejemplo) ni siquiera
// entra al bundle.
async function llamar(conMock, conApi) {
  try {
    if (import.meta.env.DEV && usarMock()) return await conMock(await import("./ecommerce.mock"));
    const { data } = await conApi();
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

export function obtenerTipos() {
  return llamar((mock) => mock.mockObtenerTipos(), () => api.get("/web/tipos"));
}

// Etapa 2: planes activos y visibles en la web (condiciones de cancelación
// y no-show), para las políticas del detalle del tipo.
export function obtenerPlanes() {
  return llamar((mock) => mock.mockObtenerPlanes(), () => api.get("/web/planes"));
}

// params: { fechaDesde, fechaHasta, adultos, menores }
export function consultarDisponibilidad(params) {
  return llamar(
    (mock) => mock.mockConsultarDisponibilidad(params),
    () => api.get("/web/disponibilidad", { params })
  );
}

// cuerpo: { fechaDesde, fechaHasta, planTarifarioId, habitaciones: [{ tipoHabitacionId, adultos, menores }] }
export function cotizar(cuerpo) {
  return llamar(
    (mock) => mock.mockCotizar(cuerpo),
    () => api.post("/web/cotizar", cuerpo)
  );
}

// cuerpo: ver CONTRATO.md → POST /api/web/reservas. Incluye la tarjeta: la
// página la pasa directo desde su estado local y la limpia después; nunca
// pasa por el contexto ni por ningún storage.
export function crearReserva(cuerpo) {
  return llamar(
    (mock) => mock.mockCrearReserva(cuerpo),
    () => api.post("/web/reservas", cuerpo, { timeout: TIMEOUT_RESERVA_MS })
  );
}

export function consultarMiReserva({ codigo, email }) {
  return llamar(
    (mock) => mock.mockConsultarMiReserva({ codigo, email }),
    () => api.post("/web/mi-reserva", { codigo, email })
  );
}

// Con cargo, `aceptaCargo: true` y `montoAceptado` (texto decimal, por ejemplo "25000.00") son obligatorios.
export function cancelarMiReserva({ codigo, email, aceptaCargo, montoAceptado }) {
  return llamar(
    (mock) => mock.mockCancelarMiReserva({ codigo, email, aceptaCargo, montoAceptado }),
    () => api.post("/web/mi-reserva/cancelar", { codigo, email, aceptaCargo, montoAceptado })
  );
}
