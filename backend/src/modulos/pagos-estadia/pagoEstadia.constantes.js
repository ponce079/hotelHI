// A diferencia de Pagos a Proveedores (Sprint 2), acá no hay Cheque —
// HU-50 solo pide poder combinar estos 5.
const MEDIOS_PAGO_ESTADIA = ['Efectivo', 'Tarjeta crédito', 'Tarjeta débito', 'Transferencia', 'Online'];

// Estos dos medios no se registran "a mano": necesitan la referencia de la
// autorización (marca, últimos 4, código). El frontend la genera con la
// terminal simulada; el backend la exige para que no se pueda saltear
// mandando el POST directo.
const MEDIOS_CON_TARJETA = ['Tarjeta crédito', 'Tarjeta débito'];

// Qué originó el cobro — sumado para la pantalla de Movimientos de Pago
// (HU-88), que si no no puede distinguir una seña de una garantía o de un
// pago de check-out normal. "Pago final" es el default (ver PagoEstadia.
// concepto en schema.prisma): es lo que siempre fue HU-50 antes de que
// existiera este campo.
const CONCEPTO_SENIA = 'Seña';
const CONCEPTO_GARANTIA = 'Garantía';
const CONCEPTO_PAGO_FINAL = 'Pago final';
const CONCEPTOS_PAGO_ESTADIA = [CONCEPTO_SENIA, CONCEPTO_GARANTIA, CONCEPTO_PAGO_FINAL];

module.exports = {
  MEDIOS_PAGO_ESTADIA,
  MEDIOS_CON_TARJETA,
  CONCEPTO_SENIA,
  CONCEPTO_GARANTIA,
  CONCEPTO_PAGO_FINAL,
  CONCEPTOS_PAGO_ESTADIA,
};
