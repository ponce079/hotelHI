// Helpers puros del listado de Reservas (rediseño). fechaDesde/fechaHasta son "solo día" (medianoche UTC en el
// backend): se comparan como texto "YYYY-MM-DD" y se formatean en UTC, nunca con la zona del navegador.
// "Hoy" se pasa por parámetro (hoyEnHoraLocal() de lib/fechas.js, hora argentina) para poder probarlo.
import { formatearPrecio } from "./moneda";
import { nochesEntre } from "./fechas";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const soloDia = (valor) => String(valor ?? "").slice(0, 10);

// "2026-10-08T00:00:00.000Z" -> "jue 8 oct"
export function formatearDiaConSemana(valor) {
  const iso = soloDia(valor);
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function etiquetaNoches(reserva) {
  const n = reserva.noches ?? nochesEntre(reserva.fechaDesde, reserva.fechaHasta);
  return `${n} ${n === 1 ? "noche" : "noches"}`;
}

// Aviso de la estadía (texto) o null.
export function avisoEstadia(reserva, hoy) {
  const desde = soloDia(reserva.fechaDesde);
  const hasta = soloDia(reserva.fechaHasta);
  if (reserva.estado === "Confirmada") {
    if (desde === hoy) return "Llega hoy";
    if (desde < hoy) return "Llegada atrasada";
  }
  if (reserva.estado === "En curso") {
    if (hasta === hoy) return "Sale hoy";
    if (hasta < hoy) return "Salida vencida";
  }
  return null;
}

// { adultos, menores } sumados de todas las habitaciones.
export function totalPersonas(reserva) {
  return (reserva.habitaciones ?? []).reduce(
    (acc, h) => ({ adultos: acc.adultos + (h.adultos ?? 0), menores: acc.menores + (h.menores ?? 0) }),
    { adultos: 0, menores: 0 }
  );
}

// "2 adultos" / "1 adulto" / "2 ad · 1 men"
export function etiquetaPax(reserva) {
  const { adultos, menores } = totalPersonas(reserva);
  if (menores > 0) return `${adultos} ad · ${menores} men`;
  return `${adultos} ${adultos === 1 ? "adulto" : "adultos"}`;
}

// Números separados por " · " y, debajo, el tipo ("2 × Doble superior" o "N habitaciones").
export function resumenHabitaciones(reserva) {
  const habitaciones = reserva.habitaciones ?? [];
  const numeros = habitaciones.map((h) => h.numero).join(" · ") || "—";
  const tipos = [...new Set(habitaciones.map((h) => h.tipo).filter(Boolean))];
  let detalle = "";
  if (habitaciones.length === 1) detalle = habitaciones[0].tipo ?? "";
  else if (habitaciones.length > 1) {
    const mismoTipo = tipos.length === 1 && habitaciones.every((h) => h.tipo);
    detalle = mismoTipo ? `${habitaciones.length} × ${tipos[0]}` : `${habitaciones.length} habitaciones`;
  }
  return { numeros, detalle };
}

export function iniciales(nombre) {
  const palabras = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  const primera = palabras[0][0];
  const ultima = palabras.length > 1 ? palabras[palabras.length - 1][0] : "";
  return `${primera}${ultima}`.toUpperCase();
}

// "$ 412.500" (decimales solo si no son ,00). Precio final con IVA incluido: no se agrega nada.
export const formatearTotal = (n) => formatearPrecio(n);
