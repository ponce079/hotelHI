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

// Estados de un requerimiento de reposición (HU-81, ampliado en Sprint 3 —
// Transferencia a Central). "Aprobado" NO se setea a mano: es consecuencia
// de aprobar un presupuesto (HU-84). Los de Sprint 3 son: "Sugerida" (la
// reposición automática del central que espera confirmación humana) y el
// resto del circuito de una TRANSFERENCIA ("Pendiente de stock" → "En
// tránsito" → "Recibida" → "Cerrada"). No existe una "compra directa" desde
// un depósito periférico: el tipo es 100% inferido de `deposito.esCentral`
// (periférico → TRANSFERENCIA, central → COMPRA), sin excepción — ver el
// guard en crearRequerimiento (requerimientos.servicio.js).
const ESTADOS_REQUERIMIENTO = {
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

// De dónde salió el requerimiento: cargado a mano, disparado desde una
// alerta de stock mínimo (HU-8, Sprint 1), o generado porque una
// TRANSFERENCIA no tenía stock del central para completarse (Sprint 3).
const ORIGENES_REQUERIMIENTO = { MANUAL: "MANUAL", ALERTA: "ALERTA", TRANSFERENCIA_BLOQUEADA: "TRANSFERENCIA_BLOQUEADA" };

// Rediseño de la pantalla de Requerimientos — cada estado (más el booleano
// `anulado`, que pisa cualquier estado) mapea a UNA de estas 4 categorías
// visuales fijas. Agregar un estado nuevo el día de mañana es una sola
// línea acá, no tocar cada componente que dibuja un color. Espejo exacto
// en frontend/src/lib/constantes.js.
const CATEGORIAS_REQUERIMIENTO = {
  NECESITA_ACCION: "NECESITA_ACCION",
  EN_CURSO: "EN_CURSO",
  COMPLETADO: "COMPLETADO",
  CANCELADO: "CANCELADO",
};

const CATEGORIA_POR_ESTADO = {
  [ESTADOS_REQUERIMIENTO.PENDIENTE]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  [ESTADOS_REQUERIMIENTO.SUGERIDA]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  [ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  // "Recibida" (no "Recibida con diferencia" — no existe ese estado
  // aparte, es el mismo estado RECIBIDA) implica que la recepción tuvo una
  // diferencia sin resolver: alguien de compras todavía tiene que
  // revisarla antes de que pase a Cerrada. Mismo criterio que el nodo
  // ámbar del timeline (frontend/src/lib/requerimientosTimeline.js) — no
  // es un estado "completado" todavía.
  [ESTADOS_REQUERIMIENTO.RECIBIDA]: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
  [ESTADOS_REQUERIMIENTO.EN_COTIZACION]: CATEGORIAS_REQUERIMIENTO.EN_CURSO,
  [ESTADOS_REQUERIMIENTO.APROBADO]: CATEGORIAS_REQUERIMIENTO.EN_CURSO,
  [ESTADOS_REQUERIMIENTO.EN_TRANSITO]: CATEGORIAS_REQUERIMIENTO.EN_CURSO,
  [ESTADOS_REQUERIMIENTO.CERRADA]: CATEGORIAS_REQUERIMIENTO.COMPLETADO,
  [ESTADOS_REQUERIMIENTO.RECHAZADA]: CATEGORIAS_REQUERIMIENTO.CANCELADO,
};

// `anulado` siempre pisa la categoría por estado — mismo criterio que ya
// usa el badge de la lista hoy ("Anulado" en vez del estado real).
function categoriaDeRequerimiento({ estado, anulado }) {
  if (anulado) return CATEGORIAS_REQUERIMIENTO.CANCELADO;
  return CATEGORIA_POR_ESTADO[estado] ?? CATEGORIAS_REQUERIMIENTO.EN_CURSO;
}

// Estados agrupados por categoría, derivados de CATEGORIA_POR_ESTADO (no
// se listan a mano dos veces) — los usa obtenerResumenRequerimientos para
// los contadores y el filtro por categoría de la pantalla.
function estadosDeCategoria(categoria) {
  return Object.entries(CATEGORIA_POR_ESTADO)
    .filter(([, cat]) => cat === categoria)
    .map(([estado]) => estado);
}

// Sprint 3 — Transferencia a Central. "COMPRA": a un proveedor externo
// (el único tipo que existía hasta Sprint 2). "TRANSFERENCIA": a un
// depósito central interno, resuelto por el sistema sin proveedor.
const TIPOS_REQUERIMIENTO = { COMPRA: "COMPRA", TRANSFERENCIA: "TRANSFERENCIA" };

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

// Guarda contra el desfase silencioso: si alguien agrega un rubro a
// RUBROS y se olvida de sumarlo acá, rubroCubreCategoria devuelve false
// para TODO sin ningún aviso — el proveedor queda inhabilitado para
// cualquier requerimiento y nadie se entera de que la causa es este mapa.
// Falla fuerte al cargar el módulo en vez de fallar en silencio en
// producción. (El mapa puede tener claves de más — categorías de
// artículos futuras — pero no de menos que RUBROS.)
const rubrosSinMapear = RUBROS.filter((r) => !(r in MAPA_RUBRO_CATEGORIA));
if (rubrosSinMapear.length > 0) {
  throw new Error(
    `MAPA_RUBRO_CATEGORIA no tiene entrada para: ${rubrosSinMapear.join(", ")}. ` +
      "Agregalo en backend/src/lib/constantes.js Y en su espejo frontend/src/lib/constantes.js."
  );
}

// Opciones para prisma.$transaction. El default de Prisma es timeout 5s /
// maxWait 2s, que alcanza contra una base local pero NO contra la base
// compartida de Clever Cloud: está en París (confirmado resolviendo el
// host a 91.208.207.108, AS213394 Clever Cloud SAS, Île-de-France), y el
// backend de cada integrante corre en su propia máquina en Salta — toda la
// ida y vuelta de cada consulta cruza el Atlántico dos veces. Medido en
// vivo contra esa base (Etapa 4C, docs/bug-timeout-transacciones.md): una
// vez abierta la conexión, cada consulta tarda en promedio ~387ms, y una
// alta de 15 noches × 2 habitaciones (34 consultas tras la optimización de
// Etapa 4C) puede rondar los 14-15s. 20s dejaba poco margen ante una
// variación de red; con 30s el peor caso medido queda con margen holgado.
// En producción (backend y base en el mismo datacenter) esto no aplica:
// cada consulta tarda ~1-2ms, así que una transacción entera corre en bien
// menos de 100ms. Además de subir el techo, la regla es dejar adentro de
// la transacción SOLO las escrituras que tienen que ser atómicas: las
// lecturas con include (que Prisma resuelve en varias consultas) van
// después del commit.
const OPCIONES_TRANSACCION = { timeout: 30000, maxWait: 15000 };

// Motivo al marcar como revisada la diferencia de una transferencia
// (MovimientoStock.motivoResolucion, HU-14/17). "Se generó pedido por la
// diferencia" lo pone solo el atajo "Pedir los N faltantes" — no está
// pensado para elegirlo a mano desde el dropdown, pero se valida igual del
// lado del servidor sin distinguir el origen del pedido.
const MOTIVOS_RESOLUCION_DIFERENCIA = [
  "Reclamado al depósito",
  "Se acepta la diferencia",
  "Se generó pedido por la diferencia",
  "Otro",
];

// Motivo al marcar como revisada la diferencia de una OC "Recibida con
// diferencia" (OrdenCompra.motivoResolucion) — Recepciones Parte B. Lista
// distinta de MOTIVOS_RESOLUCION_DIFERENCIA (transferencias): acá la
// resolución pasa por proveedor/facturación, no por depósito. Ninguna de
// las 3 dispara nada solo: "Nota de crédito registrada" y "Reposición
// pedida al proveedor" documentan una gestión que la persona ya hizo (o va
// a hacer) a mano en Comprobantes/Requerimientos — no hay atajo automático
// como "Pedir los N faltantes" del lado de transferencias, ver diagnóstico.
const MOTIVOS_RESOLUCION_DIFERENCIA_OC = [
  "Nota de crédito registrada",
  "Reposición pedida al proveedor",
  "Se acepta la diferencia",
];

module.exports = {
  RUBROS,
  CONDICIONES_COMERCIALES,
  ESTADOS_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  TIPOS_REQUERIMIENTO,
  CATEGORIAS_REQUERIMIENTO,
  CATEGORIA_POR_ESTADO,
  categoriaDeRequerimiento,
  estadosDeCategoria,
  ESTADOS_PRESUPUESTO,
  MAPA_RUBRO_CATEGORIA,
  rubroCubreCategoria,
  OPCIONES_TRANSACCION,
  MOTIVOS_RESOLUCION_DIFERENCIA,
  MOTIVOS_RESOLUCION_DIFERENCIA_OC,
};
