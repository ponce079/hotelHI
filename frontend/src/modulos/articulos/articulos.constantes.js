// Mismos valores que backend/src/modulos/articulos/articulos.constantes.js — mantener sincronizado.
// El backend espera el codigo abreviado (UN, KG, etc.), pero en la interfaz
// se muestra el nombre completo para que sea mas claro al elegir.

export const UNIDADES_MEDIDA = ["UN", "KG", "LT", "MT", "CJ", "PQ", "RL", "DZ"];

export const UNIDADES_MEDIDA_NOMBRES = {
  UN: "Unidad",
  KG: "Kilogramo",
  LT: "Litro",
  MT: "Metro",
  CJ: "Caja",
  PQ: "Paquete",
  RL: "Rollo",
  DZ: "Docena",
};

export const CATEGORIAS = [
  "Limpieza",
  "Amenities",
  "Blanquería",
  "Alimentos y Bebidas",
  "Mantenimiento",
  "Papelería y Oficina",
  "Equipamiento y Electrodomésticos",
];

export const NOMBRE_MAX_LENGTH = 150;

// Letras (con acentos/ñ), números y espacios. Sin símbolos ni signos de puntuación.
export const NOMBRE_REGEX = /^[\p{L}\p{N}\s]+$/u;
