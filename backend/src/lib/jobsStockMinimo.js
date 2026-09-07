// src/lib/jobsStockMinimo.js
//
// Job periódico — red de seguridad de la reposición automática de
// centrales (ver barrerStockMinimoCentral en requerimientos.servicio.js
// para el motivo: el trigger por evento no cubre un artículo que YA nace
// por debajo del mínimo sin que medie un movimiento posterior).
//
// setInterval en el propio proceso, sin dependencia nueva (node-cron,
// etc.): este proyecto no tiene infraestructura de jobs y una cadencia de
// "cada N horas" no necesita sintaxis de cron. Si el día de mañana hace
// falta que corra aunque el proceso esté caído (o en varias instancias a
// la vez), esto se reemplaza por un endpoint disparado desde afuera — el
// motor (barrerStockMinimoCentral) queda igual, solo cambia quién lo llama.
const { barrerStockMinimoCentral } = require("../modulos/requerimientos/requerimientos.servicio");

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
  }

  // Corre una vez al arrancar (cierra el gap si el servidor estuvo caído o
  // si se acaba de cargar/editar data) y después cada INTERVALO_MS.
  correr();
  setInterval(correr, INTERVALO_MS);
}

module.exports = { iniciarBarridoStockMinimoCentral };
