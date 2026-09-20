// Mismos 5 medios que backend/src/modulos/pagos-estadia/pagoEstadia.constantes.js.
// A diferencia de Pagos a Proveedores, acá no hay Cheque (HU-50).
export const MEDIOS_PAGO_ESTADIA = ["Efectivo", "Tarjeta crédito", "Tarjeta débito", "Transferencia", "Online"];

// PagoEstadia.estado -> variante de <Badge>. Un pago anulado se muestra
// aparte (neutro), no con su estado original.
export const ESTADO_PAGO_BADGE = { Pagado: "ok", Parcial: "alerta" };
