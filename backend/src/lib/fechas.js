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

// Día de semana (0=domingo … 6=sábado) de una fecha-sin-hora ya normalizada
// a medianoche UTC (ver parsearFechaSinHora/hoyComoFechaUTC arriba) — SIEMPRE
// getUTCDay(), nunca getDay(): getDay() lee en la hora local del PROCESO que
// corre el código, no en la de Argentina, así que en un servidor con otro
// huso horario correría el día (una fecha guardada como "2027-09-10
// medianoche UTC" es indiscutiblemente un viernes en el calendario elegido;
// eso no puede depender de dónde esté físicamente el proceso). Se agrega acá
// (Etapa 3 de tarifas por temporada, HU-94) porque el motor de cotización lo
// necesita para resolver el modificador por día de semana de cada noche.
function diaSemanaDeFecha(fecha) {
  return fecha.getUTCDay();
}

// Etapa 4B de tarifas por temporada (HU-98) — combina una fecha-sin-hora ya
// normalizada a medianoche UTC del día calendario argentino (ver
// parsearFechaSinHora/hoyComoFechaUTC arriba) con una hora del reloj de
// Argentina, para calcular el límite de cancelación sin cargo ("la fecha de
// llegada a la hora de check-in, menos las horas de anticipación del plan").
// Argentina es UTC-3 fijo (sin horario de verano desde 2009, mismo criterio
// que el resto de este archivo), así que "14:00 hora argentina" de esa fecha
// calendario es 17:00 UTC del mismo día — nunca se recalcula el offset a
// partir de la hora del proceso.
function combinarFechaConHoraArgentina(fechaSinHora, hora, minuto = 0) {
  return new Date(fechaSinHora.getTime() + (hora + 3) * 60 * 60 * 1000 + minuto * 60 * 1000);
}

// Edades. Son dos criterios distintos y no se mezclan:
//   - EDAD_ADULTO_OCUPACION: solo para CONTAR adultos y menores de una habitación (y por lo
//     tanto para el precio). Menores de 0 a 12 años; desde los 13 cuenta como adulto.
//   - MAYORIA_EDAD: todo lo legal — ser titular de una habitación o de la reserva, ser
//     responsable de un menor, que todo menor de 18 tenga un responsable y el orden de salida.
const EDAD_ADULTO_OCUPACION = 13;
const MAYORIA_EDAD = 18;

// Años cumplidos en una fecha (las dos como fecha-sin-hora a medianoche UTC).
function edadEn(nacimiento, fecha) {
  const n = new Date(nacimiento);
  const en = new Date(fecha);
  let edad = en.getUTCFullYear() - n.getUTCFullYear();
  if (
    en.getUTCMonth() < n.getUTCMonth() ||
    (en.getUTCMonth() === n.getUTCMonth() && en.getUTCDate() < n.getUTCDate())
  )
    edad--;
  return edad;
}

const esMenorParaOcupacion = (nacimiento, fecha) => edadEn(nacimiento, fecha) < EDAD_ADULTO_OCUPACION;
const esMayorDeEdad = (nacimiento, fecha) => edadEn(nacimiento, fecha) >= MAYORIA_EDAD;

module.exports = {
  EDAD_ADULTO_OCUPACION,
  MAYORIA_EDAD,
  edadEn,
  esMenorParaOcupacion,
  esMayorDeEdad,
  ZONA_ARGENTINA,
  hoyComoFechaUTC,
  parsearFechaSinHora,
  diaSemanaDeFecha,
  combinarFechaConHoraArgentina,
};
