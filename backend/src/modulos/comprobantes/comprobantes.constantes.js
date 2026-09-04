// Tipos de comprobante permitidos
const TIPOS_COMPROBANTE = ['Factura', 'Nota de Débito', 'Nota de Crédito'];
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
  ESTADOS_MATCHING,
  ESTADOS_COMPROBANTE
};