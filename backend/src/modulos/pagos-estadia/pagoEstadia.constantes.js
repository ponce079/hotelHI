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
// Conceptos de la garantía con tarjeta (feature/garantia-tarjeta). Viven en
// modulos/garantias/garantias.constantes.js; se listan acá porque la pantalla
// de Movimientos de Pago filtra y valida contra esta lista. "Seña" y
// "Garantía" quedan como conceptos HISTÓRICOS: ya no se crean filas nuevas,
// pero las existentes siguen mostrándose y filtrándose.
const CONCEPTO_PAGO_ANTICIPADO = 'Pago anticipado';
const CONCEPTO_PENALIDAD_CANCELACION = 'Penalidad por cancelación';
const CONCEPTO_PENALIDAD_NO_SHOW = 'Penalidad no-show';
const CONCEPTO_DEVOLUCION = 'Devolución';
const CONCEPTOS_PAGO_ESTADIA = [
  CONCEPTO_SENIA,
  CONCEPTO_GARANTIA,
  CONCEPTO_PAGO_FINAL,
  CONCEPTO_PAGO_ANTICIPADO,
  CONCEPTO_PENALIDAD_CANCELACION,
  CONCEPTO_PENALIDAD_NO_SHOW,
  CONCEPTO_DEVOLUCION,
];

module.exports = {
  MEDIOS_PAGO_ESTADIA,
  MEDIOS_CON_TARJETA,
  CONCEPTO_SENIA,
  CONCEPTO_GARANTIA,
  CONCEPTO_PAGO_FINAL,
  CONCEPTO_PAGO_ANTICIPADO,
  CONCEPTO_PENALIDAD_CANCELACION,
  CONCEPTO_PENALIDAD_NO_SHOW,
  CONCEPTO_DEVOLUCION,
  CONCEPTOS_PAGO_ESTADIA,
};
