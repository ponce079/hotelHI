// src/modulos/articulos/articulos.constantes.js

const UNIDADES_MEDIDA = ["UN", "KG", "LT", "MT", "CJ", "PQ", "RL", "DZ"];

const CATEGORIAS = [
  "Limpieza",
  "Amenities",
  "Blanquería",
  "Alimentos y Bebidas",
  "Mantenimiento",
  "Papelería y Oficina",
  "Equipamiento y Electrodomésticos",
];

const NOMBRE_MAX_LENGTH = 150;

// Letras (con acentos/ñ), números y espacios. Sin símbolos ni signos de puntuación.
const NOMBRE_REGEX = /^[\p{L}\p{N}\s]+$/u;

// Sprint 3 — Transferencia a Central. "SUGERIDA": la reposición automática
// del central (por mínimo o por transferencia bloqueada) queda en una
// bandeja para confirmar a mano. "AUTOMATICA": entra directo al tablero de
// Compras, igual que el origen ALERTA de hoy.
const MODOS_REPOSICION = ["SUGERIDA", "AUTOMATICA"];

module.exports = { UNIDADES_MEDIDA, CATEGORIAS, NOMBRE_MAX_LENGTH, NOMBRE_REGEX, MODOS_REPOSICION };
