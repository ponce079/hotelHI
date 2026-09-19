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
