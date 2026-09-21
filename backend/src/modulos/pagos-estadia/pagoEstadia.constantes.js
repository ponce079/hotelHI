// A diferencia de Pagos a Proveedores (Sprint 2), acá no hay Cheque —
// HU-50 solo pide poder combinar estos 5.
const MEDIOS_PAGO_ESTADIA = ['Efectivo', 'Tarjeta crédito', 'Tarjeta débito', 'Transferencia', 'Online'];

// Estos dos medios no se registran "a mano": necesitan la referencia de la
// autorización (marca, últimos 4, código). El frontend la genera con la
// terminal simulada; el backend la exige para que no se pueda saltear
// mandando el POST directo.
const MEDIOS_CON_TARJETA = ['Tarjeta crédito', 'Tarjeta débito'];

module.exports = { MEDIOS_PAGO_ESTADIA, MEDIOS_CON_TARJETA };
