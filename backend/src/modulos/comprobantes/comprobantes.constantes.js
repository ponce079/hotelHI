// Tipos de comprobante permitidos
const TIPOS_COMPROBANTE = ['Factura', 'Nota de Débito', 'Nota de Crédito'];

// Formato AFIP (letra-4 dígitos-8 dígitos, ej. A-0001-00012345) — se exige
// igual para Factura, Nota de Débito y Nota de Crédito: los tres son
// comprobantes fiscales con numeración propia emitida por el proveedor,
// nunca autogenerada acá.
const PATRON_NUMERO_COMPROBANTE = /^[A-Za-z]-\d{4}-\d{8}$/;

// Motivo fijo de la Nota de Crédito que se ofrece automáticamente al cargar
// la factura de una OC "Recibida con diferencia" sin NC todavía — no lo
// tipea el usuario (ver crearComprobanteConAjustes).
const MOTIVO_NC_DIFERENCIA_RECEPCION = 'Diferencia de recepción';
// Estados de matching (solo para facturas con OC)
const ESTADOS_MATCHING = {
  OK: 'OK',
  DIFERENCIA: 'Diferencia',
  NO_APLICA: 'No aplica'
};

// Estado del comprobante (HU-74) — derivado en runtime a partir del saldo,
// no es una columna. Solo aplica a Facturas: una Nota de Débito/Crédito no
// tiene saldo propio (ver calcularEstadoComprobante en comprobantes.servicio.js).
const ESTADOS_COMPROBANTE = {
  PENDIENTE: 'Pendiente',
  PAGADO_PARCIAL: 'Pagado Parcial',
  PAGADO: 'Pagado',
  ANULADO: 'Anulado'
};

module.exports = {
  TIPOS_COMPROBANTE,
  PATRON_NUMERO_COMPROBANTE,
  MOTIVO_NC_DIFERENCIA_RECEPCION,
  ESTADOS_MATCHING,
  ESTADOS_COMPROBANTE
};