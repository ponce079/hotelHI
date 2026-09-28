// src/lib/fechas.js
//
// "Hoy" en hora argentina (UTC-3 fijo, sin horario de verano desde 2009),
// nunca la hora del proceso ni UTC a secas — mismo criterio que
// frontend/src/lib/fechas.js. Vive en lib/ (no en reservas.constantes.js,
// que también define su propia copia del literal) porque desde HU-89
// también lo necesita habitaciones.servicio.js para la regla de "reserva
// vigente" al cambiar el tipo de una habitación: importarlo directo desde
// reservas.servicio.js cerraría un ciclo de require con lib/tipoHabitacion.js
// (ver el comentario ahí). reservas.servicio.js pasa a importar esta copia
// en vez de tener la suya local.

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

function hoyComoFechaUTC() {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
  return new Date(`${hoy}T00:00:00.000Z`);
}

const PATRON_FECHA_SIN_HORA = /^\d{4}-\d{2}-\d{2}$/;

// Fecha "solo día" (sin hora) normalizada a medianoche UTC del día
// elegido — la misma convención que ya usa Reserva.fechaDesde/fechaHasta
// desde Sprint 3 (reservas.servicio.js). Se extrae acá (Etapa 2 de
// tarifas por temporada, HU-90/92/93) para que Temporada/Tarifa/
// LoteActualizacionTarifaria la reutilicen sin duplicar la lógica de
// parseo — solo el literal seguía duplicado antes (ver ZONA_ARGENTINA
// arriba), pero esta es lógica de verdad, no un literal.
//
// Tira un Error PLANO (no un ErrorDeNegocio de módulo: lib/ no puede
// depender de la clase de errores de ningún *.servicio.js). Quien llama
// re-envuelve el mensaje en su propio ErrorDeNegocio — mismo patrón que
// ya usa el proyecto para traducir errores de otro módulo (ver
// envolverErrorReservas en checkOut.servicio.js).
function parsearFechaSinHora(valor, campo) {
  const texto = valor instanceof Date ? valor.toISOString() : typeof valor === "string" ? valor.trim() : "";
  const soloFecha = texto.slice(0, 10);
  if (!PATRON_FECHA_SIN_HORA.test(soloFecha)) {
    throw new Error(`${campo} es obligatoria y debe tener formato AAAA-MM-DD.`);
  }
  const fecha = new Date(`${soloFecha}T00:00:00.000Z`);
  // Date "corrige" solo un 2026-02-31 al 3 de marzo en vez de fallar, así
  // que la única forma de detectar un día inexistente es comparar la
  // vuelta con lo que entró.
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== soloFecha) {
    throw new Error(`${campo} no es una fecha válida del calendario.`);
  }
  return fecha;
}

module.exports = { ZONA_ARGENTINA, hoyComoFechaUTC, parsearFechaSinHora };
