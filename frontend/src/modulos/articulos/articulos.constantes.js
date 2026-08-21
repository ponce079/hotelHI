// Mismos valores que backend/src/modulos/articulos/articulos.constantes.js — mantener sincronizado.
// El backend espera el codigo abreviado (UN, KG, etc.), pero en la interfaz
// se muestra el nombre completo para que sea mas claro al elegir.

// 3 letras + guion + 3 numeros (ej: ART-001). El input ya se muestra en
// mayusculas mientras se escribe (ver ArticuloForm), asi que esta regex
// solo necesita chequear el formato, no la capitalizacion.
export const FORMATO_CODIGO = /^[A-Z]{3}-\d{3}$/;

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
