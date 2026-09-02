// Mismos valores que backend/src/modulos/pagos/pagos.constantes.js — mantener sincronizado.

export const MEDIOS_PAGO = ["Efectivo", "Transferencia", "Cheque"];

export const BANCOS = ["Banco Nación", "Banco Galicia", "Banco Santander", "Banco Macro", "BBVA"];

export const ESTADOS_CHEQUE = ["Emitido", "Cobrado", "Rechazado"];

// Mapeos compartidos entre PagosPage y OrdenPagoDetallePage — un solo
// lugar para que la lista y el detalle siempre muestren el mismo color
// de badge.
export const BADGE_ESTADO = { Pagado: "ok", Rechazada: "error", Anulada: "neutro" };
export const BADGE_ESTADO_CHEQUE = { Emitido: "alerta", Cobrado: "ok", Rechazado: "error" };
