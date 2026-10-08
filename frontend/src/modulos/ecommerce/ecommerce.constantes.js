// Constantes del motor de reservas web (e-commerce). Contrato de la API en
// docs/ecommerce/CONTRATO.md — si algo de acá cambia, cambia también el
// contrato (solo Gimena).
import { MAX_NOCHES_ESTADIA } from "../tarifas/tarifas.constantes";

// Versión de términos + política de cancelación + privacidad (Ley 25.326)
// que el huésped acepta. Viaja en consentimiento.versionPoliticas.
export const VERSION_POLITICAS = "2026-10-01";

// El contrato acepta hasta 3 líneas en `habitaciones`; la UI de esta etapa
// maneja una sola (selector de varias habitaciones: etapa 2).
export const MAX_HABITACIONES_WEB = 3;

export const CLAVE_IDEMPOTENCIA_MIN = 8;
export const CLAVE_IDEMPOTENCIA_MAX = 64;
export const MAX_SOLICITUDES = 500;
export { MAX_NOCHES_ESTADIA };

// Límites del buscador (por habitación).
export const MAX_ADULTOS_HABITACION = 4;
export const MAX_MENORES_HABITACION = 3;

// "Últimas disponibles" se informa como booleano desde el backend (quedan
// <= 2); el umbral vive acá solo para el mock y la documentación.
export const UMBRAL_ULTIMAS_DISPONIBLES = 2;

export const HORAS_LLEGADA = [
  { valor: "NO_SABE", etiqueta: "No lo sé todavía" },
  { valor: "14-16", etiqueta: "14 a 16 h" },
  { valor: "16-18", etiqueta: "16 a 18 h" },
  { valor: "18-20", etiqueta: "18 a 20 h" },
  { valor: "20-22", etiqueta: "20 a 22 h" },
  { valor: "DESPUES_22", etiqueta: "Después de las 22 h" },
];

export const PASOS = [
  { numero: 1, clave: "habitacion", etiqueta: "Habitación" },
  { numero: 2, clave: "datos", etiqueta: "Tus datos" },
  { numero: 3, clave: "pago", etiqueta: "Pago" },
  { numero: 4, clave: "confirmacion", etiqueta: "Confirmación" },
];

// Catálogos ÚNICOS del sistema (se importan, no se copian): los mismos que
// usa la ficha de huésped del mostrador y del check-in.
//   - Tipo de documento: frontend/src/lib/tiposDocumento.js.
//   - País del documento, nacionalidad y país de residencia: códigos ISO
//     3166-1 alfa-2 de frontend/src/lib/paises.js (PAISES son pares
//     [codigo, nombre]).
export { TIPOS_DOCUMENTO, ETIQUETAS_NUMERO_DOCUMENTO, normalizarTipoDocumento } from "../../lib/tiposDocumento";
export { PAISES, codigoPais, nombrePais } from "../../lib/paises";

// El titular tiene que ser mayor de edad a la fecha de ingreso (mismo
// criterio que normalizarAltaReserva en el backend).
export const EDAD_MINIMA_TITULAR = 18;

// Códigos de error del contrato (más ERROR_RED, propio del frontend).
export const CODIGO_ERROR = {
  DATOS_INVALIDOS: "DATOS_INVALIDOS",
  NO_ENCONTRADA: "NO_ENCONTRADA",
  PRECIO_CAMBIADO: "PRECIO_CAMBIADO",
  SIN_DISPONIBILIDAD: "SIN_DISPONIBILIDAD",
  CLAVE_REUTILIZADA: "CLAVE_REUTILIZADA",
  PENALIDAD_CAMBIO: "PENALIDAD_CAMBIO",
  PAGO_RECHAZADO: "PAGO_RECHAZADO",
  TARJETA_VENCE_ANTES: "TARJETA_VENCE_ANTES",
  DEMASIADOS_INTENTOS: "DEMASIADOS_INTENTOS",
  ERROR_INTERNO: "ERROR_INTERNO",
  ERROR_RED: "ERROR_RED",
};

// Idempotencia (CONTRATO.md → "Idempotencia"): después de una respuesta
// DEFINITIVA del servidor (la reserva no se creó) se reintenta con clave
// nueva. Cualquier otro error (ERROR_RED, timeout, ERROR_INTERNO,
// DEMASIADOS_INTENTOS) se reintenta con la MISMA clave: el pedido pudo
// haberse procesado y una clave nueva crearía una segunda reserva y un
// segundo cobro.
export const CODIGOS_REGENERAN_CLAVE = [
  CODIGO_ERROR.DATOS_INVALIDOS,
  CODIGO_ERROR.PRECIO_CAMBIADO,
  CODIGO_ERROR.SIN_DISPONIBILIDAD,
  CODIGO_ERROR.PAGO_RECHAZADO,
  CODIGO_ERROR.TARJETA_VENCE_ANTES,
  CODIGO_ERROR.CLAVE_REUTILIZADA,
];

export function debeRegenerarClave(codigo) {
  return CODIGOS_REGENERAN_CLAVE.includes(codigo);
}
