// Mismos valores que backend/src/modulos/depositos/depositos.constantes.js — mantener sincronizado.

export const NOMBRE_MAX_LENGTH = 100;
export const RESPONSABLE_MAX_LENGTH = 100;
export const UBICACION_MAX_LENGTH = 100;

// Letras (con acentos/ñ), números y espacios. Sin símbolos ni signos de puntuación.
export const UBICACION_REGEX = /^[\p{L}\p{N}\s]+$/u;
