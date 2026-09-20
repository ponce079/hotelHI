// Tipos de comprobante de estadía. Mismo mecanismo que ComprobanteProveedor
// (Sprint 2) pero sin Nota de Débito: acá solo hace falta poder corregir
// hacia abajo (HU-56), no hay caso de negocio para sumar un cargo por nota.
const TIPOS_COMPROBANTE_ESTADIA = ['Comprobante', 'Nota de Crédito'];

// Alícuota de IVA sugerida por defecto en el formulario — el recepcionista
// puede cambiarla si hace falta, no es una restricción de negocio.
const ALICUOTA_IVA_DEFAULT = 21;

module.exports = {
  TIPOS_COMPROBANTE_ESTADIA,
  ALICUOTA_IVA_DEFAULT,
};
