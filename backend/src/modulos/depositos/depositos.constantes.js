// src/modulos/depositos/depositos.constantes.js

const UBICACIONES = [
  "Subsuelo",
  "Planta Baja",
  "Piso 1",
  "Piso 2",
  "Piso 3",
  "Cocina",
  "Lavandería",
  "Rooftop",
];

const NOMBRE_MAX_LENGTH = 100;
const RESPONSABLE_MAX_LENGTH = 100;

// Letras (con acentos/ñ), números y espacios. Sin símbolos ni signos de puntuación.
const NOMBRE_REGEX = /^[\p{L}\p{N}\s]+$/u;

// Nombre de persona: solo letras y espacios, sin números ni símbolos.
const RESPONSABLE_REGEX = /^[\p{L}\s]+$/u;

module.exports = {
  UBICACIONES,
  NOMBRE_MAX_LENGTH,
  RESPONSABLE_MAX_LENGTH,
  NOMBRE_REGEX,
  RESPONSABLE_REGEX,
};
