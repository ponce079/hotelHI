// Mismos estados que backend/src/modulos/ordenes-compra/ordenesCompra.servicio.js
// (comentario en el modelo OrdenCompra del schema.prisma) — mantener
// sincronizado. Un solo lugar para que OrdenesCompraPage y
// OrdenCompraDetallePage siempre muestren el mismo color de badge.

// "Cerrada" está en la lista porque es parte del enum completo del modelo
// (schema.prisma), pero ningún criterio de aceptación del Sprint 2 dice qué
// la dispara — ni HU-85 (que deja la OC en Recibida/Recibida con diferencia)
// ni ninguna otra. Queda intencionalmente sin alcanzar por ahora (nada la
// asigna en ordenesCompra.servicio.js); se revisa cuando haya un criterio
// real que la use — probablemente ligado al cierre del comprobante/pago
// (HU-72 a 80), fuera de este sprint.
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

// "Recibida con diferencia" es "ok" (verde), no "alerta": con "alerta"
// quedaba del mismo color que "Pendiente" y las dos se confundían de un
// vistazo en la lista — ya llegó y se recibió, sigue siendo un cierre
// exitoso del circuito, la diferencia se distingue con el ícono ◆, no con
// un color de advertencia que compite con "todavía no se envió".
export const BADGE_ESTADO_OC = {
  Pendiente: "alerta",
  Enviada: "ok",
  Recibida: "ok",
  "Recibida con diferencia": "ok",
  Anulada: "neutro",
  Cerrada: "neutro",
};
