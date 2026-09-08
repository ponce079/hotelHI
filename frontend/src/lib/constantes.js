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

// Ampliado en Sprint 3 — Transferencia a Central (ver backend/src/lib/constantes.js).
export const ESTADOS_REQUERIMIENTO = {
  SUGERIDA: "Sugerida",
  PENDIENTE: "Pendiente",
  EN_COTIZACION: "En cotización",
  APROBADO: "Aprobado",
  PENDIENTE_DE_STOCK: "Pendiente de stock",
  EN_TRANSITO: "En tránsito",
  RECIBIDA: "Recibida",
  CERRADA: "Cerrada",
  RECHAZADA: "Rechazada",
};

export const ORIGENES_REQUERIMIENTO = { MANUAL: "MANUAL", ALERTA: "ALERTA", TRANSFERENCIA_BLOQUEADA: "TRANSFERENCIA_BLOQUEADA" };

// Sprint 3 — Transferencia a Central.
export const TIPOS_REQUERIMIENTO = { COMPRA: "COMPRA", TRANSFERENCIA: "TRANSFERENCIA" };

// Rediseño de la pantalla de Requerimientos — cada estado (más `anulado`,
// que pisa cualquier estado) mapea a UNA de estas 4 categorías visuales
// fijas. Espejo exacto de backend/src/lib/constantes.js: agregar un
// estado nuevo es una línea acá y otra allá, no tocar cada componente que
// dibuja un color.
export const CATEGORIAS_REQUERIMIENTO = {
  NECESITA_ACCION: "NECESITA_ACCION",
  EN_CURSO: "EN_CURSO",
  COMPLETADO: "COMPLETADO",
  CANCELADO: "CANCELADO",
};

export const CATEGORIA_POR_ESTADO = {
  [ESTADOS_REQUERIMIENTO.PENDIENTE]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  [ESTADOS_REQUERIMIENTO.SUGERIDA]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  [ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  // "Recibida" implica que la recepción tuvo una diferencia sin resolver:
  // alguien de compras todavía tiene que revisarla antes de que pase a
  // Cerrada. Mismo criterio que el nodo ámbar del timeline
  // (requerimientosTimeline.js) — no es un estado "completado" todavía.
  [ESTADOS_REQUERIMIENTO.RECIBIDA]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  [ESTADOS_REQUERIMIENTO.EN_COTIZACION]: CATEGORIAS_REQUERIMIENTO.EN_CURSO,
  [ESTADOS_REQUERIMIENTO.APROBADO]: CATEGORIAS_REQUERIMIENTO.EN_CURSO,
  [ESTADOS_REQUERIMIENTO.EN_TRANSITO]: CATEGORIAS_REQUERIMIENTO.EN_CURSO,
  [ESTADOS_REQUERIMIENTO.CERRADA]: CATEGORIAS_REQUERIMIENTO.COMPLETADO,
  [ESTADOS_REQUERIMIENTO.RECHAZADA]: CATEGORIAS_REQUERIMIENTO.CANCELADO,
};

export function categoriaDeRequerimiento({ estado, anulado }) {
  if (anulado) return CATEGORIAS_REQUERIMIENTO.CANCELADO;
  return CATEGORIA_POR_ESTADO[estado] ?? CATEGORIAS_REQUERIMIENTO.EN_CURSO;
}

export function estadosDeCategoria(categoria) {
  return Object.entries(CATEGORIA_POR_ESTADO)
    .filter(([, cat]) => cat === categoria)
    .map(([estado]) => estado);
}

// Variante de <Badge> por categoría (no por estado puntual — ver punto 3
// del rediseño). "info" (azul) se agregó a Badge.jsx específicamente para
// esto: las 4 que había (ok/alerta/error/neutro) no cubrían "en curso".
export const VARIANTE_POR_CATEGORIA = {
  [CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION]: "error",
  [CATEGORIAS_REQUERIMIENTO.EN_CURSO]: "info",
  [CATEGORIAS_REQUERIMIENTO.COMPLETADO]: "ok",
  [CATEGORIAS_REQUERIMIENTO.CANCELADO]: "neutro",
};

export const ESTADOS_PRESUPUESTO = {
  SOLICITADO: "Solicitado",
  PENDIENTE_APROBACION: "Pendiente de aprobación",
  RECHAZADO: "Rechazado",
  ADJUDICADO: "Adjudicado",
};

// Variante de <Badge> por estado puntual — la usa la ficha de detalle.
// El listado usa VARIANTE_POR_CATEGORIA (más arriba) para las 4 categorías
// fijas del rediseño; esta sigue viva para mostrar el estado real, más
// específico, en la ficha.
export const VARIANTE_ESTADO_REQUERIMIENTO = {
  Sugerida: "neutro",
  Pendiente: "alerta",
  "En cotización": "alerta",
  Aprobado: "ok",
  "Pendiente de stock": "alerta",
  "En tránsito": "alerta",
  // "alerta", no "ok" como Cerrada: implica que llegó CON diferencia y
  // alguien todavía tiene que revisarla (ver ordenesCompra.servicio.js) —
  // mismo criterio que el nodo del timeline en RequerimientoDetallePage.
  Recibida: "alerta",
  Cerrada: "ok",
  Rechazada: "error",
};

export const VARIANTE_ESTADO_PRESUPUESTO = {
  Solicitado: "neutro",
  "Pendiente de aprobación": "alerta",
  Rechazado: "error",
  Adjudicado: "ok",
};

// Plazo de entrega de un presupuesto (HU-83): número de días + esta unidad
// fija, en vez de texto libre — así se puede comparar objetivamente entre
// proveedores en la pantalla de comparación (ver parsearDiasPlazo en
// lib/fechas.js). Presupuesto.plazoEntrega sigue siendo un String en la
// base: esto arma/valida el texto ("5 días hábiles"), no cambia el modelo.
export const UNIDADES_PLAZO_ENTREGA = { HABILES: "días hábiles", CORRIDOS: "días corridos" };

// Rubro del proveedor <-> categoría del artículo (HU-82). El backend
// valida lo mismo con esta tabla (es el que manda); acá se usa para el
// filtro "rubro afín" de SolicitarPresupuestosModal.
export const MAPA_RUBRO_CATEGORIA = {
  Limpieza: ["Limpieza"],
  Amenities: ["Amenities"],
  Alimentos: ["Alimentos y Bebidas"],
  Bebidas: ["Alimentos y Bebidas"],
  "Blancos y textiles": ["Blanquería"],
  Mantenimiento: ["Mantenimiento", "Equipamiento y Electrodomésticos"],
  "Bazar y menaje": ["Equipamiento y Electrodomésticos", "Papelería y Oficina"],
};

export function rubroCubreCategoria(rubro, categoria) {
  return (MAPA_RUBRO_CATEGORIA[rubro] ?? []).includes(categoria);
}

// Motivo al marcar como revisada la diferencia de una transferencia
// (MovimientoStock.motivoResolucion, HU-14/17) — ver backend/src/lib/constantes.js.
export const MOTIVOS_RESOLUCION_DIFERENCIA = [
  "Reclamado al depósito",
  "Se acepta la diferencia",
  "Se generó pedido por la diferencia",
  "Otro",
];

// Motivo al marcar como revisada la diferencia de una OC "Recibida con
// diferencia" (OrdenCompra.motivoResolucion) — ver backend/src/lib/constantes.js.
export const MOTIVOS_RESOLUCION_DIFERENCIA_OC = [
  "Nota de crédito registrada",
  "Reposición pedida al proveedor",
  "Se acepta la diferencia",
];
