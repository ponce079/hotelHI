// src/modulos/tipos-movimiento/tiposMovimiento.constantes.js

const TIPOS_VALIDOS = ["E", "S"];

const DESCRIPCION_MAX_LENGTH = 100;

// Letras (con acentos/ñ), números y espacios. Sin símbolos ni signos de puntuación.
const DESCRIPCION_REGEX = /^[\p{L}\p{N}\s]+$/u;

module.exports = { TIPOS_VALIDOS, DESCRIPCION_MAX_LENGTH, DESCRIPCION_REGEX };
