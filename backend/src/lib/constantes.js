// src/lib/constantes.js
//
// Listas fijas compartidas de Sprint 2 (Guía Técnica, sección 0). La idea
// es que una lista viva en UN solo lugar: si "30 días cta. cte." se
// escribe distinto en dos módulos, los filtros y los selects dejan de
// coincidir y nadie se entera hasta que un listado sale vacío.
//
// El espejo de este archivo en el frontend es frontend/src/lib/constantes.js
// — mismos valores, misma redacción. Si tocás uno, tocá el otro.
//
// Nota para el equipo: MEDIOS_PAGO, BANCOS y ESTADOS_CHEQUE hoy viven en
// src/modulos/pagos/pagos.constantes.js (se escribieron antes que este
// archivo). No los movimos para no tocar el módulo de Pagos y generar un
// conflicto de merge — si en algún momento se unifican, que sea una tarea
// explícita de una sola persona, no algo que salga de a poco.

// Rubros que puede cubrir un proveedor (HU-18). Un proveedor tiene al
// menos uno y puede tener varios.
const RUBROS = [
  "Alimentos",
  "Bebidas",
  "Blancos y textiles",
  "Limpieza",
  "Amenities",
  "Mantenimiento",
  "Bazar y menaje",
];

// Condición comercial pactada con el proveedor (HU-18). Ojo con la
// redacción: "15 días cta. cte." — con "cta. cte." al final, no solo
// "15 días" — es la que ya está cargada en la base por seed-proveedores.js.
const CONDICIONES_COMERCIALES = [
  "Contado",
  "15 días cta. cte.",
  "30 días cta. cte.",
  "60 días cta. cte.",
];

// Estados de un requerimiento de reposición (HU-81). "Aprobado" NO se
// setea a mano: es consecuencia de aprobar un presupuesto (HU-84).
const ESTADOS_REQUERIMIENTO = {
  PENDIENTE: "Pendiente",
  EN_COTIZACION: "En cotización",
  APROBADO: "Aprobado",
};

// De dónde salió el requerimiento: cargado a mano o disparado desde una
// alerta de stock mínimo (HU-8, Sprint 1).
const ORIGENES_REQUERIMIENTO = { MANUAL: "MANUAL", ALERTA: "ALERTA" };

// Estados de un presupuesto (HU-82 a 84). "Solicitado" es la invitación
// a cotizar (todavía sin precios); "Adjudicado" es el único que habilita
// generar la orden de compra.
const ESTADOS_PRESUPUESTO = {
  SOLICITADO: "Solicitado",
  PENDIENTE_APROBACION: "Pendiente de aprobación",
  RECHAZADO: "Rechazado",
  ADJUDICADO: "Adjudicado",
};

// Rubro del proveedor (Sprint 2) <-> categoría del artículo (catálogo de
// Sprint 1): no son la misma lista, así que se emparejan las que
// claramente se solapan. La usan tanto el filtro "rubro afín" del
// frontend (SolicitarPresupuestosPage) como la validación real de HU-82
// en presupuestos.servicio.js — antes vivía duplicada (y sin usarse en el
// backend) como `sonAfines()` local del frontend.
const MAPA_RUBRO_CATEGORIA = {
  Limpieza: ["Limpieza"],
  Amenities: ["Amenities"],
  Alimentos: ["Alimentos y Bebidas"],
  Bebidas: ["Alimentos y Bebidas"],
  "Blancos y textiles": ["Blanquería"],
  Mantenimiento: ["Mantenimiento", "Equipamiento y Electrodomésticos"],
  "Bazar y menaje": ["Equipamiento y Electrodomésticos", "Papelería y Oficina"],
};

function rubroCubreCategoria(rubro, categoria) {
  return (MAPA_RUBRO_CATEGORIA[rubro] ?? []).includes(categoria);
}

// Opciones para prisma.$transaction. El default de Prisma es timeout 5s /
// maxWait 2s, que alcanza contra una base local pero NO contra la base
// compartida de Clever Cloud: está en Francia, exige SSL y el plan
// gratuito agrega latencia, así que 3 o 4 escrituras seguidas se pasan de
// los 5s y Prisma tira P2028 ("A commit cannot be executed on an expired
// transaction"). Además de subir el techo, la regla es dejar adentro de la
// transacción SOLO las escrituras que tienen que ser atómicas: las
// lecturas con include (que Prisma resuelve en varias consultas) van
// después del commit.
const OPCIONES_TRANSACCION = { timeout: 20000, maxWait: 10000 };

module.exports = {
  RUBROS,
  CONDICIONES_COMERCIALES,
  ESTADOS_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  ESTADOS_PRESUPUESTO,
  MAPA_RUBRO_CATEGORIA,
  rubroCubreCategoria,
  OPCIONES_TRANSACCION,
};
