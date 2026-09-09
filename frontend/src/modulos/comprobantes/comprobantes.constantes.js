// Espejo de backend/src/modulos/comprobantes/comprobantes.constantes.js.

// Formato AFIP (letra-4 dígitos-8 dígitos, ej. A-0001-00012345) — mismo
// patrón que valida el backend, acá solo para dar el error antes del submit.
export const PATRON_NUMERO_COMPROBANTE = /^[A-Za-z]-\d{4}-\d{8}$/;

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

// Umbral (en días) para marcar una factura "por vencer" — ajustable acá,
// un solo lugar para ComprobantesPage y el wizard de Pagos.
export const UMBRAL_VENCIMIENTO_DIAS = 5;

// Variante de <Badge> por estado de vencimiento (ver estadoVencimiento en
// lib/fechas.js) — vencido en rojo, por vencer en amarillo, null = sin badge.
export const VARIANTE_VENCIMIENTO = {
  vencido: "error",
  porVencer: "alerta",
};

export const LABEL_VENCIMIENTO = {
  vencido: "Vencida",
  porVencer: "Por vencer",
};
