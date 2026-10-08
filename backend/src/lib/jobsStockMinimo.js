// src/lib/jobsStockMinimo.js
//
// Job periódico — red de seguridad de la reposición automática de
// centrales. Corre dos barridos independientes:
//   1) barrerStockMinimoCentral (ver esa función en requerimientos.servicio.js
//      para el motivo: el trigger por evento no cubre un artículo que YA
//      nace por debajo del mínimo sin que medie un movimiento posterior).
//   2) barrerTransferenciasPendientes — red de seguridad del reintento por
//      evento en registrarRecepcion (ordenesCompra.servicio.js): ese
//      reintento ahora corre desacoplado (setImmediate, fuera de la
//      transacción de la recepción, ver el comentario de
//      dispararReintentoTransferenciasPendientes en ese archivo) para no
//      volver a causar el timeout de 30s que motivó este cambio. El costo
//      de ese desacople es una ventana donde, si el proceso se cae antes de
//      que el reintento por evento llegue a correr, una transferencia se
//      queda "Pendiente de stock" sin nadie que la reintente — este barrido
//      cierra esa ventana como máximo en INTERVALO_MS, en vez de nunca.
//
// setInterval en el propio proceso, sin dependencia nueva (node-cron,
// etc.): este proyecto no tiene infraestructura de jobs y una cadencia de
// "cada N horas" no necesita sintaxis de cron. Si el día de mañana hace
// falta que corra aunque el proceso esté caído (o en varias instancias a
// la vez), esto se reemplaza por un endpoint disparado desde afuera — los
// motores (barrerStockMinimoCentral / barrerTransferenciasPendientes) quedan
// iguales, solo cambia quién los llama.
const {
  barrerStockMinimoCentral,
  barrerTransferenciasPendientes,
} = require("../modulos/requerimientos/requerimientos.servicio");

// Cada 6 horas: lo bastante seguido para que una carga inicial de datos o
// un cambio de stockMinimo por ABM no quede crítico en silencio más de
// medio día, sin recorrer la tabla de artículos-depósito con una frecuencia
// que no tiene sentido para algo que cambia lento.
const INTERVALO_MS = 6 * 60 * 60 * 1000;
let iniciado = false;
// Una sola corrida a la vez en este proceso: si un barrido tarda más que el intervalo (base remota lenta),
// la siguiente invocación se saltea en vez de apilarse y competir por las conexiones del pool.
let enCurso = false;

// TAREAS_AUTOMATICAS=off desactiva las tareas de fondo (contra la base compartida, solo un backend del equipo
// debería tenerlas activas). Cualquier otro valor, o vacío, las deja activas.
function tareasActivas(env = process.env) {
  return String(env.TAREAS_AUTOMATICAS ?? "").trim().toLowerCase() !== "off";
}

// Corre un barrido sin dejar nunca una promesa rechazada sin catch.
async function correrBarrido(nombre, fn, describir) {
  try {
    console.log(`[jobsStockMinimo] ${describir(await fn())}`);
  } catch (err) {
    // Un fallo acá (ej. la base remota caída en ese instante) no puede tirar abajo el servidor — se
    // reintenta solo en la próxima corrida.
    console.error(`[jobsStockMinimo] falló el ${nombre}:`, err?.message ?? err);
  }
}

async function correr() {
  if (enCurso) {
    console.warn("[jobsStockMinimo] la corrida anterior todavía no terminó: se saltea esta.");
    return false;
  }
  enCurso = true;
  try {
    await correrBarrido(
      "barrido de stock mínimo central",
      barrerStockMinimoCentral,
      (r) => `barrido de stock mínimo central: ${r.revisados} artículo(s) revisado(s), ${r.conError} con error.`
    );
    // Barrido independiente del de arriba (no comparte transacción ni depende de su resultado): red de
    // seguridad del reintento por evento de registrarRecepcion — ver el comentario al principio de este archivo.
    await correrBarrido(
      "barrido de transferencias pendientes",
      barrerTransferenciasPendientes,
      (r) => `barrido de transferencias pendientes: ${r.revisadas} revisada(s).`
    );
  } finally {
    enCurso = false;
  }
  return true;
}

function iniciarBarridoStockMinimoCentral(env = process.env) {
  if (!tareasActivas(env)) {
    console.log("[jobsStockMinimo] TAREAS_AUTOMATICAS=off: las tareas automáticas están desactivadas en este proceso.");
    return false;
  }
  // Protege contra imports/arranques duplicados: un solo proceso debe tener un solo intervalo.
  if (iniciado) return false;
  iniciado = true;
  // El primer barrido queda para el intervalo: ejecutarlo al arrancar competía con las primeras consultas en la
  // base remota compartida.
  const temporizador = setInterval(() => {
    correr().catch((err) => console.error("[jobsStockMinimo] error inesperado:", err?.message ?? err));
  }, INTERVALO_MS);
  temporizador.unref?.();
  return true;
}

module.exports = { iniciarBarridoStockMinimoCentral, tareasActivas, correr };
