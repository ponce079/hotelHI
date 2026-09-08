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

function iniciarBarridoStockMinimoCentral() {
  async function correr() {
    try {
      const resultado = await barrerStockMinimoCentral();
      console.log(
        `[jobsStockMinimo] barrido de stock mínimo central: ${resultado.revisados} artículo(s) revisado(s), ${resultado.conError} con error.`
      );
    } catch (err) {
      // Un fallo acá (ej. la base remota caída en ese instante) no puede
      // tirar abajo el servidor — se reintenta solo en la próxima corrida.
      console.error("[jobsStockMinimo] falló el barrido de stock mínimo central:", err.message);
    }

    // Barrido independiente del de arriba (no comparte transacción ni
    // depende de su resultado): red de seguridad del reintento por evento
    // de registrarRecepcion — ver el comentario al principio de este
    // archivo y dispararReintentoTransferenciasPendientes en
    // ordenesCompra.servicio.js.
    try {
      const resultado = await barrerTransferenciasPendientes();
      console.log(`[jobsStockMinimo] barrido de transferencias pendientes: ${resultado.revisadas} revisada(s).`);
    } catch (err) {
      console.error("[jobsStockMinimo] falló el barrido de transferencias pendientes:", err.message);
    }
  }

  // Corre una vez al arrancar (cierra el gap si el servidor estuvo caído o
  // si se acaba de cargar/editar data) y después cada INTERVALO_MS.
  correr();
  setInterval(correr, INTERVALO_MS);
}

module.exports = { iniciarBarridoStockMinimoCentral };
