// Mismas listas fijas que backend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js,
// duplicadas a mano (misma convención que el resto de Sprint 3).
export const TIPOS_SERVICIO = ["Restaurante", "Spa", "Lavandería", "Minibar"];

// Sin variante propia por tipo: son categorías de consumo, no estados —
// "neutro" para todas evita sugerir que alguna es "mejor" o "peor" que otra.
export const TIPO_SERVICIO_BADGE = {
  Restaurante: "neutro",
  Spa: "neutro",
  Lavandería: "neutro",
  Minibar: "info",
};

export const LIMITES_SERVICIOS_ADICIONALES = {
  registradoPor: 100,
};

// Mismo valor que backend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js
// (duplicado a mano, misma convención). El consumo de Minibar SIEMPRE
// descuenta de este depósito fijo — no se le pide a quien carga el consumo
// que elija de dónde sale, solo se usa acá para mostrarle el stock
// disponible real de ese depósito puntual.
export const DEPOSITO_MINIBAR_NOMBRE = "Minibar";
