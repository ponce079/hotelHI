// src/modulos/articulos/articulos.constantes.js

// 3 letras + guion + 3 numeros (ej: ART-001). El codigo se normaliza a
// mayusculas antes de validar/guardar, para que "art-001" tambien sea valido
// y quede consistente con "ART-001" en la base.
const FORMATO_CODIGO = /^[A-Z]{3}-\d{3}$/;

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

module.exports = { FORMATO_CODIGO, UNIDADES_MEDIDA, CATEGORIAS };
