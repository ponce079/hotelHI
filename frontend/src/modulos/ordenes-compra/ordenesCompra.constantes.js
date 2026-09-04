// Mismos estados que backend/src/modulos/ordenes-compra/ordenesCompra.servicio.js
// (comentario en el modelo OrdenCompra del schema.prisma) — mantener
// sincronizado. Un solo lugar para que OrdenesCompraPage y
// OrdenCompraDetallePage siempre muestren el mismo color de badge.

// "Cerrada" está en la lista porque es parte del enum completo del
// modelo (schema.prisma) y del enunciado de HU-23, pero ningún criterio
// de aceptación del Sprint 2 dice qué la dispara — ni HU-85 (que deja la
// OC en Recibida/Recibida con diferencia) ni ninguna otra. Queda
// intencionalmente sin alcanzar por ahora (nada la asigna en
// ordenesCompra.servicio.js); se revisa cuando haya un criterio real que
// la use — probablemente ligado al cierre del comprobante/pago
// (HU-72 a 80), fuera de este sprint.
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
