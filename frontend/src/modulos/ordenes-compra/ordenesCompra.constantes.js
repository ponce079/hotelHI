// Mismos estados que backend/src/modulos/ordenes-compra/ordenesCompra.servicio.js
// (comentario en el modelo OrdenCompra del schema.prisma) — mantener
// sincronizado. Un solo lugar para que OrdenesCompraPage y
// OrdenCompraDetallePage siempre muestren el mismo color de badge.

// "Cerrada" se dispara automáticamente (verificarCierrePorPagos en
// ordenesCompra.servicio.js) cuando la OC ya está Recibida/Recibida con
// diferencia y TODOS sus comprobantes vinculados (Factura, no anulados)
// están en estado "Pagado" — se revisa tanto al confirmar un pago como al
// crear una Nota de Crédito grande, y también al registrar la recepción
// (por si el pago ya se había completado antes). Nada la asigna a mano.
//
// No hay estado "Aprobada": la OC no pasa por ninguna aprobación de
// gerente propia — esa aprobación ya se dio al adjudicar el presupuesto
// (HU-84). Compras genera la OC y la envía directo, sin paso intermedio.
export const ESTADOS_OC = [
  "Pendiente",
  "Enviada",
  "Recibida",
  "Recibida con diferencia",
  "Anulada",
  "Cerrada",
];

// Rediseño de la lista de OC — 6 estados, cada uno con su propio color y
// significado (antes Pendiente/Enviada/Recibida compartían tonos pastel
// casi indistinguibles):
// - Pendiente: gris cálido — todavía no arrancó nada (falta enviarla).
// - Enviada: celeste — en tránsito, esperando al proveedor.
// - Recibida: verde — llegó bien (puede seguir teniendo facturación/pago
//   pendiente; eso se señala aparte con el ícono de alertaFacturacion).
// - Recibida con diferencia: ámbar — llegó, pero con algo para revisar.
// - Anulada: rojo apagado — fuera de circuito, resultado negativo.
// - Cerrada: gris oscuro — fuera de circuito, completado con éxito;
//   deliberadamente distinto de "Recibida" (ok/verde) para no confundir
//   "ya llegó" con "ya se pagó todo y no queda nada pendiente".
export const BADGE_ESTADO_OC = {
  Pendiente: "neutro",
  Enviada: "info",
  Recibida: "ok",
  "Recibida con diferencia": "alerta",
  Anulada: "error",
  Cerrada: "cerrado",
};
