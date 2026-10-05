// Funciones puras de formato del e-commerce (testeadas en formato.test.js).
// Fechas "solo día" en YYYY-MM-DD: se interpretan como día calendario, sin
// pasar por el huso horario del navegador.

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// $ 50.000 / $ 42.500,50 — formato es-AR, sin decimales cuando son ,00.
export function formatearPrecio(monto) {
  const n = Number(monto);
  if (!Number.isFinite(n)) return "";
  const centavos = Math.round(n * 100);
  const entero = centavos % 100 === 0;
  const texto = (centavos / 100).toLocaleString("es-AR", {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: entero ? 0 : 2,
  });
  return `$ ${texto}`;
}

function partes(fechaISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaISO ?? ""));
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return { anio, mes, dia, diaSemana };
}

// "Vie 16 oct 2026". Con { conAnio: false }: "Vie 16 oct".
export function formatearFecha(fechaISO, { conAnio = true } = {}) {
  const p = partes(fechaISO);
  if (!p) return "";
  const base = `${DIAS[p.diaSemana]} ${p.dia} ${MESES[p.mes - 1]}`;
  return conAnio ? `${base} ${p.anio}` : base;
}

// "Vie 16 oct → Dom 18 oct 2026" (mismo año) o
// "Jue 31 dic 2026 → Sáb 2 ene 2027" (años distintos).
export function formatearRangoFechas(desdeISO, hastaISO) {
  const d = partes(desdeISO);
  const h = partes(hastaISO);
  if (!d || !h) return "";
  if (d.anio === h.anio) return `${formatearFecha(desdeISO, { conAnio: false })} → ${formatearFecha(hastaISO)}`;
  return `${formatearFecha(desdeISO)} → ${formatearFecha(hastaISO)}`;
}

// Instante ISO (ej. limiteSinCargo de Mi reserva) en hora de Salta:
// "Mié 18 nov 2026 a las 14:00". El navegador puede estar en otro huso.
export function formatearInstanteHotel(instanteISO) {
  const fecha = new Date(instanteISO ?? "");
  if (!instanteISO || Number.isNaN(fecha.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Salta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(fecha)
      .map(({ type, value }) => [type, value])
  );
  return `${formatearFecha(`${p.year}-${p.month}-${p.day}`)} a las ${p.hour}:${p.minute}`;
}

export function calcularNoches(desdeISO, hastaISO) {
  const d = partes(desdeISO);
  const h = partes(hastaISO);
  if (!d || !h) return 0;
  const ms = Date.UTC(h.anio, h.mes - 1, h.dia) - Date.UTC(d.anio, d.mes - 1, d.dia);
  return Math.round(ms / 86400000);
}

export function textoNoches(noches) {
  return `${noches} ${noches === 1 ? "noche" : "noches"}`;
}

// "2 adultos · 1 menor"
export function textoOcupacion({ adultos = 0, menores = 0 } = {}) {
  const a = `${adultos} ${adultos === 1 ? "adulto" : "adultos"}`;
  if (!menores) return a;
  return `${a} · ${menores} ${menores === 1 ? "menor" : "menores"}`;
}

// Nombre del plan para el huésped (la base no cambia: BAR / NRF siguen con su
// nombre interno, que ve el mostrador).
export function nombreComercialPlan(plan) {
  if (!plan) return "";
  return plan.reembolsable ? "Tarifa flexible" : "No reembolsable";
}

// Condiciones del plan, armadas a partir de sus campos (decisión de diseño 2).
export function textoCondicionesPlan(plan) {
  if (!plan) return "";
  if (plan.reembolsable) {
    return `Cancelación sin cargo hasta ${plan.horasCancelacionSinCargo} h antes de la llegada`;
  }
  return "Se cobra el total al reservar · Sin devolución";
}

export const LEYENDA_PRECIO_FINAL = "Precio final en pesos argentinos, IVA incluido";

// Query string de /web/resultados (?desde&hasta&adultos&menores).
export function busquedaComoQuery({ fechaDesde, fechaHasta, adultos, menores }) {
  return new URLSearchParams({ desde: fechaDesde, hasta: fechaHasta, adultos: String(adultos), menores: String(menores) }).toString();
}

// Estado que muestra la confirmación (decisión de diseño 7).
export function textoEstadoReserva(resultado) {
  return resultado?.plan?.reembolsable ? "Confirmada · garantizada con tarjeta" : "Pagada";
}
