// Mismos estados que backend/src/modulos/ordenes-compra/ordenesCompra.servicio.js
// (comentario en el modelo OrdenCompra del schema.prisma) — mantener
// sincronizado. Un solo lugar para que OrdenesCompraPage y
// OrdenCompraDetallePage siempre muestren el mismo color de badge.

export const ESTADOS_OC = [
  "Pendiente",
  "Aprobada",
  "Enviada",
  "Recibida",
  "Recibida con diferencia",
  "Anulada",
  "Cerrada",
];

export const BADGE_ESTADO_OC = {
  Pendiente: "alerta",
  Aprobada: "alerta",
  Enviada: "ok",
  Recibida: "ok",
  "Recibida con diferencia": "error",
  Anulada: "neutro",
  Cerrada: "neutro",
};
