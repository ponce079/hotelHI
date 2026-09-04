// Espejo de backend/src/lib/constantes.js — mismos valores, misma
// redacción. Si tocás uno, tocá el otro (Guía Técnica Sprint 2, sección 0).
//
// Los medios de pago y bancos hoy viven en modulos/pagos/pagos.constantes.js,
// que se escribió antes que este archivo. No se movieron para no tocar el
// módulo de Pagos; si se unifican, que sea una tarea explícita.

export const RUBROS = [
  "Alimentos",
  "Bebidas",
  "Blancos y textiles",
  "Limpieza",
  "Amenities",
  "Mantenimiento",
  "Bazar y menaje",
];

export const CONDICIONES_COMERCIALES = [
  "Contado",
  "15 días cta. cte.",
  "30 días cta. cte.",
  "60 días cta. cte.",
];

export const ESTADOS_REQUERIMIENTO = {
  PENDIENTE: "Pendiente",
  EN_COTIZACION: "En cotización",
  APROBADO: "Aprobado",
};

export const ORIGENES_REQUERIMIENTO = { MANUAL: "MANUAL", ALERTA: "ALERTA" };

export const ESTADOS_PRESUPUESTO = {
  SOLICITADO: "Solicitado",
  PENDIENTE_APROBACION: "Pendiente de aprobación",
  RECHAZADO: "Rechazado",
  ADJUDICADO: "Adjudicado",
};

// Variante de <Badge> por estado. Las 4 variantes que existen alcanzan
// (ok / alerta / error / neutro) — no inventar una quinta sin avisar al
// grupo (Guía Técnica, sección 0.5).
export const VARIANTE_ESTADO_REQUERIMIENTO = {
  Pendiente: "alerta",
  "En cotización": "alerta",
  Aprobado: "ok",
};

export const VARIANTE_ESTADO_PRESUPUESTO = {
  Solicitado: "neutro",
  "Pendiente de aprobación": "alerta",
  Rechazado: "error",
  Adjudicado: "ok",
};
