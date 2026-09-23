// Alícuotas de IVA habituales en Argentina. El recepcionista elige una; la
// de default es la general (21%) — no es una restricción de negocio.
export const ALICUOTAS_IVA = [21, 10.5, 27, 0];
export const ALICUOTA_IVA_DEFAULT = 21;

// Mismo formato y regex que backend/src/modulos/proveedores/proveedores.constantes.js.
export const CUIT_REGEX = /^\d{2}-\d{8}-\d$/;
export const RAZON_SOCIAL_MAX_LENGTH = 150;

// Mismo límite que la columna (VARCHAR(191)) y que valida el backend.
export const MOTIVO_NOTA_CREDITO_MAX_LENGTH = 191;

export const TIPOS_COMPROBANTE_ESTADIA = ["Comprobante", "Nota de Crédito"];

// Escribe el CUIT con los guiones puestos mientras se tipea: el usuario
// solo carga los 11 dígitos y el campo los ubica solo (00-00000000-0).
export function formatearCuit(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

// ComprobanteEstadia.tipo -> variante de <Badge>. Sin color propio por tipo
// (mismo criterio que TIPO_SERVICIO_BADGE en Servicios Adicionales): son
// categorías de documento, no un estado operativo, así que las dos comparten
// tono neutro en vez de competir con el color de Estado (Vigente/Anulado).
export const TIPO_COMPROBANTE_BADGE = { Comprobante: "neutro", "Nota de Crédito": "neutro" };

// Vista previa del desglose para mostrar en pantalla ANTES de emitir. El
// que manda es el backend (crearComprobante lo calcula y lo guarda una sola
// vez): esta cuenta replica su fórmula solo para que el recepcionista vea
// los números, nunca se envía.
export function desglosarTotalConIva(total, alicuota) {
  const redondear = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const neto = redondear(total / (1 + alicuota / 100));
  return { neto, iva: redondear(total - neto), total: redondear(total) };
}
