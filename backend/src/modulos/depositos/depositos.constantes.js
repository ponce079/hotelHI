// src/modulos/depositos/depositos.constantes.js

const NOMBRE_MAX_LENGTH = 100;
const RESPONSABLE_MAX_LENGTH = 100;
const UBICACION_MAX_LENGTH = 100;

// Letras (con acentos/ñ), números y espacios. Sin símbolos ni signos de puntuación.
const NOMBRE_REGEX = /^[\p{L}\p{N}\s]+$/u;

// Nombre de persona: solo letras y espacios, sin números ni símbolos.
const RESPONSABLE_REGEX = /^[\p{L}\s]+$/u;

// Ubicación es texto libre (el usuario la escribe): mismo charset que el nombre.
const UBICACION_REGEX = /^[\p{L}\p{N}\s]+$/u;

module.exports = {
  NOMBRE_MAX_LENGTH,
  RESPONSABLE_MAX_LENGTH,
  UBICACION_MAX_LENGTH,
  NOMBRE_REGEX,
  RESPONSABLE_REGEX,
  UBICACION_REGEX,
};
