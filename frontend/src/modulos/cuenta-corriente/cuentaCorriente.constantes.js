// Mismos valores que backend/src/modulos/cuenta-corriente/cuentaCorriente.constantes.js — mantener sincronizado.

export const TIPOS_MOVIMIENTO = ["Factura", "Nota de Débito", "Nota de Crédito", "Pago"];

// Antigüedad de lo que se debe (Factura/Nota de Débito, "debe" > 0): no
// hay fecha de vencimiento en el modelo (ver ComprobanteProveedor), así
// que se aproxima con días corridos desde la fecha del comprobante —
// mismo criterio que ya usa el sort "Antigüedad del saldo" en
// Comprobantes (ordenarPor=antiguedad -> fecha asc). Compartido entre
// CuentaCorrientePage (fila por fila) y la pestaña de cuenta corriente
// de ProveedorDetallePage (resumen), para no calcularlo dos veces.
export function diasDesde(fechaISO) {
  return Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86_400_000);
}

export function variantePorAntiguedad(dias) {
  if (dias > 60) return "error";
  if (dias > 30) return "alerta";
  return "ok";
}

// Cada fila de la cuenta corriente es un documento real de otro módulo:
// un "Pago" es una OrdenPago (Pagos a Proveedores), cualquier otro tipo
// (Factura/Nota de Débito/Nota de Crédito) es un ComprobanteProveedor
// (Comprobantes). Se usa en CuentaCorrientePage y en la pestaña de
// cuenta corriente de ProveedorDetallePage para que ambas tablas
// naveguen al mismo lugar con el mismo criterio.
export function rutaDeMovimiento(m) {
  return m.tipo === "Pago" ? `/pagos/${m.id}` : `/comprobantes/${m.id}`;
}
