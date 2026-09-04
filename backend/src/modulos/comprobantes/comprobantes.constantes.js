// Tipos de comprobante permitidos
const TIPOS_COMPROBANTE = ['Factura', 'Nota de Débito', 'Nota de Crédito'];
// Estados de matching (solo para facturas con OC)
const ESTADOS_MATCHING = {
  OK: 'OK',
  DIFERENCIA: 'Diferencia',
  NO_APLICA: 'No aplica'
};

module.exports = {
  TIPOS_COMPROBANTE,
  ESTADOS_MATCHING
};