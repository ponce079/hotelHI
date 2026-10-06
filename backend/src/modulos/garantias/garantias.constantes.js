// Garantía de la reserva con tarjeta de crédito (pedido del profe).
//
// Mismo criterio que el resto del proyecto: listas fijas validadas en código.
// El espejo en el frontend vive en frontend/src/modulos/garantias/.

// Cómo se respalda una reserva.
//  TARJETA        — la normal: se guarda solo un token (nunca número ni CVV).
//  PREPAGO        — sin tarjeta: transferencia, débito o Mercado Pago ya cobrados.
//  NO_GARANTIZADA — sin respaldo; se mantiene hasta las 18 h del día de llegada
//                   (opcional, no implementada todavía).
const TIPO_GARANTIA = {
  TARJETA: "TARJETA",
  PREPAGO: "PREPAGO",
  NO_GARANTIZADA: "NO_GARANTIZADA",
};
const TIPOS_GARANTIA = Object.values(TIPO_GARANTIA);

// Estado de la garantía.
//  Vigente        — tarjeta tokenizada, sin retener ni cobrar nada (plan BAR).
//  Preautorizada  — monto retenido en la tarjeta, todavía no cobrado.
//  Capturada      — monto cobrado (NRF, o penalidad).
//  Liberada       — la retención se soltó, no se cobró nada.
//  Cobro pendiente  — se canceló o hubo no-show y falta cobrar la penalidad
//                     (el cobro está en curso, o no hay tarjeta para cobrarlo).
//  Cobro rechazado  — la tarjeta rechazó el cobro de la penalidad: la reserva
//                     igual queda cancelada y la deuda queda para recepción.
const ESTADO_GARANTIA = {
  VIGENTE: "Vigente",
  PREAUTORIZADA: "Preautorizada",
  CAPTURADA: "Capturada",
  LIBERADA: "Liberada",
  COBRO_PENDIENTE: "Cobro pendiente",
  COBRO_RECHAZADO: "Cobro rechazado",
};
const ESTADOS_GARANTIA = Object.values(ESTADO_GARANTIA);

// Operaciones de la pasarela (contrato con el e-commerce, ver
// pasarela.servicio.js).
const OPERACION_TARJETA = {
  GARANTIA: "GARANTIA",
  COBRO: "COBRO",
  PREAUTORIZACION: "PREAUTORIZACION",
  CAPTURA: "CAPTURA",
  LIBERACION: "LIBERACION",
};
const OPERACIONES_TARJETA = Object.values(OPERACION_TARJETA);

// Tarjetas de prueba de la pasarela SIMULADA (documentadas para el equipo):
//   terminación 0002 → rechazada por fondos insuficientes
//   terminación 0069 → rechazada por vencida
//   cualquier otra que pase Luhn y tenga vencimiento vigente → aprobada.
const FINAL_TARJETA_FONDOS = "0002";
const FINAL_TARJETA_VENCIDA = "0069";

// Medios válidos para un prepago (sin tarjeta de crédito). "Online" es
// Mercado Pago. Efectivo no: un prepago se hace antes de llegar.
const MEDIOS_PREPAGO = ["Transferencia", "Tarjeta débito", "Online"];

// Conceptos de PagoEstadia que crea este módulo (se suman a los de
// pagoEstadia.constantes.js).
const CONCEPTO_PAGO_ANTICIPADO = "Pago anticipado";
const CONCEPTO_PENALIDAD_CANCELACION = "Penalidad por cancelación";
const CONCEPTO_PENALIDAD_NO_SHOW = "Penalidad no-show";
const CONCEPTO_DEVOLUCION = "Devolución";

// ---------------------------------------------------------------------------
// Garantía del CHECK-IN (preautorización o depósito). No es un pago.
// ---------------------------------------------------------------------------

// Monto fijo de la política del hotel, server-side (no lo manda el cliente).
// MEJORA PENDIENTE (anotada con el equipo): lo que hacen los hoteles es
// preautorizar el alojamiento pendiente (noches congeladas menos lo pagado) más
// un monto de consumos por noche. Mientras tanto queda este valor fijo, con
// nombre, para poder cambiarlo en un solo lugar.
const MONTO_PREAUTORIZACION_CHECKIN = 30000;

const TIPO_GARANTIA_ESTADIA = {
  PREAUTORIZACION: "PREAUTORIZACION",
  DEPOSITO_EFECTIVO: "DEPOSITO_EFECTIVO",
};

// Pendiente: vigente durante la estadía · Capturada: se cobró (total o parcial)
// para cubrir saldo · Liberada: se soltó la retención sin cobrar · Aplicada: el
// depósito en efectivo se usó para cubrir saldo · Devuelta: se devolvió el
// depósito (o lo que sobró de él).
const ESTADO_GARANTIA_ESTADIA = {
  PENDIENTE: "Pendiente",
  CAPTURADA: "Capturada",
  LIBERADA: "Liberada",
  APLICADA: "Aplicada",
  DEVUELTA: "Devuelta",
};

// Medios que se ofrecen como garantía en el check-in. Débito NO: el dinero
// sale de la cuenta del huésped, no se puede "retener". Transferencia tampoco
// está entre los medios previstos.
const MEDIO_GARANTIA_TARJETA = "Tarjeta crédito";
const MEDIO_GARANTIA_EFECTIVO = "Efectivo";
const MEDIOS_GARANTIA_CHECKIN = [MEDIO_GARANTIA_TARJETA, MEDIO_GARANTIA_EFECTIVO];

module.exports = {
  MONTO_PREAUTORIZACION_CHECKIN,
  TIPO_GARANTIA_ESTADIA,
  ESTADO_GARANTIA_ESTADIA,
  MEDIO_GARANTIA_TARJETA,
  MEDIO_GARANTIA_EFECTIVO,
  MEDIOS_GARANTIA_CHECKIN,
  TIPO_GARANTIA,
  TIPOS_GARANTIA,
  ESTADO_GARANTIA,
  ESTADOS_GARANTIA,
  OPERACION_TARJETA,
  OPERACIONES_TARJETA,
  FINAL_TARJETA_FONDOS,
  FINAL_TARJETA_VENCIDA,
  MEDIOS_PREPAGO,
  CONCEPTO_PAGO_ANTICIPADO,
  CONCEPTO_PENALIDAD_CANCELACION,
  CONCEPTO_PENALIDAD_NO_SHOW,
  CONCEPTO_DEVOLUCION,
};
