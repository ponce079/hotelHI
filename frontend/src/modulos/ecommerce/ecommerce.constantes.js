// Constantes del motor de reservas web (e-commerce, etapa 1A). Contrato de la
// API en docs/ecommerce/CONTRATO.md — si algo de acá cambia, cambia también
// el contrato (solo Gimena).
import { TIPOS_DOCUMENTO } from "../reservas/reservas.constantes";
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

// Mismos valores que la ficha de huésped del sistema (se importan, no se
// copian, para que no se desincronicen).
export { TIPOS_DOCUMENTO };

// Nacionalidad y país de residencia: ISO 3166-1 alfa-2, mismo formato que
// PAISES_OCUPANTES de la rama feature/estadia-ocupantes (Agustín).
// A CONFIRMAR CON AGUSTÍN: lista definitiva y si se comparte un único catálogo.
export const PAISES = [
  { codigo: "AR", nombre: "Argentina" },
  { codigo: "BO", nombre: "Bolivia" },
  { codigo: "BR", nombre: "Brasil" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "PY", nombre: "Paraguay" },
  { codigo: "UY", nombre: "Uruguay" },
  { codigo: "PE", nombre: "Perú" },
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "VE", nombre: "Venezuela" },
  { codigo: "MX", nombre: "México" },
  { codigo: "US", nombre: "Estados Unidos" },
  { codigo: "CA", nombre: "Canadá" },
  { codigo: "ES", nombre: "España" },
  { codigo: "IT", nombre: "Italia" },
  { codigo: "FR", nombre: "Francia" },
  { codigo: "DE", nombre: "Alemania" },
  { codigo: "GB", nombre: "Reino Unido" },
  { codigo: "IL", nombre: "Israel" },
  { codigo: "CN", nombre: "China" },
  { codigo: "JP", nombre: "Japón" },
  { codigo: "AU", nombre: "Australia" },
];

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
