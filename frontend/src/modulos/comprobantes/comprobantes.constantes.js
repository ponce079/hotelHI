// Espejo de backend/src/modulos/comprobantes/comprobantes.constantes.js.

// Estado del comprobante (HU-74) — lo calcula el backend a partir del
// saldo, no es un campo que se elija acá; esto solo nombra los 4 valores
// posibles para el filtro y el badge.
export const ESTADOS_COMPROBANTE = {
  PENDIENTE: "Pendiente",
  PAGADO_PARCIAL: "Pagado Parcial",
  PAGADO: "Pagado",
  ANULADO: "Anulado",
};

// Variante de <Badge> por estado (mismo criterio que VARIANTE_ESTADO_PRESUPUESTO
// en lib/constantes.js: ok / alerta / error / neutro, nada más).
export const VARIANTE_ESTADO_COMPROBANTE = {
  Pendiente: "alerta",
  "Pagado Parcial": "alerta",
  Pagado: "ok",
  Anulado: "neutro",
};
