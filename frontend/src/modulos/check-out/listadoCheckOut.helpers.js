// Helpers puros del listado de Check-out. fechaHasta es una fecha "solo día" (medianoche UTC en el backend): se compara
// como texto "YYYY-MM-DD", igual que contarSalidas (lib/useContadoresRecepcion.js). "Hoy" llega por parámetro
// (hoyEnHoraLocal(), hora argentina), nunca la zona del navegador.
import { nochesEntre } from "../../lib/fechas";
import { resumenHabitaciones, soloDia } from "../../lib/formatosReserva";

export const VISTAS = [
  { valor: "hoy", etiqueta: "Salen hoy" },
  { valor: "vencidas", etiqueta: "Vencidas" },
  { valor: "todas", etiqueta: "Todas en casa" },
];

// ?vista= desconocida o ausente = null (la pantalla elige la pestaña por defecto).
export const vistaValida = (valor) => (VISTAS.some((v) => v.valor === valor) ? valor : null);

// Con vencidas se abre en Vencidas; si no, en Salen hoy.
export const vistaPorDefecto = (vencidas) => (vencidas > 0 ? "vencidas" : "hoy");

// "vencida" | "hoy" | "resto"
export function clasificar(reserva, hoy) {
  const salida = soloDia(reserva.fechaHasta);
  if (salida < hoy) return "vencida";
  if (salida === hoy) return "hoy";
  return "resto";
}

const RANGO = { vencida: 0, hoy: 1, resto: 2 };

// Vencidas primero, después las que salen hoy y al final el resto; dentro de cada grupo, fechaHasta ascendente
// (desempata por id para que el orden sea estable).
export function ordenarSalidas(reservas, hoy) {
  return [...(reservas ?? [])].sort((a, b) => {
    const grupo = RANGO[clasificar(a, hoy)] - RANGO[clasificar(b, hoy)];
    if (grupo !== 0) return grupo;
    const fecha = soloDia(a.fechaHasta).localeCompare(soloDia(b.fechaHasta));
    return fecha !== 0 ? fecha : a.id - b.id;
  });
}

export function filtrarPorVista(reservas, vista, hoy) {
  if (vista === "hoy") return reservas.filter((r) => clasificar(r, hoy) === "hoy");
  if (vista === "vencidas") return reservas.filter((r) => clasificar(r, hoy) === "vencida");
  return reservas;
}

// Indicadores de la lista completa (sin búsqueda). null mientras no hay datos.
export function calcularIndicadores(reservas, hoy) {
  if (!Array.isArray(reservas)) return null;
  let salenHoy = 0;
  let vencidas = 0;
  let habitaciones = 0;
  for (const r of reservas) {
    const grupo = clasificar(r, hoy);
    if (grupo === "hoy") salenHoy += 1;
    if (grupo === "vencida") vencidas += 1;
    habitaciones += (r.habitaciones ?? []).length;
  }
  return { salenHoy, vencidas, enCasa: reservas.length, habitaciones };
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Aviso bajo la estadía: { tipo: "hoy" | "vencida" | "quedan", texto }.
export function avisoSalida(reserva, hoy) {
  const grupo = clasificar(reserva, hoy);
  if (grupo === "hoy") return { tipo: "hoy", texto: "Sale hoy" };
  if (grupo === "vencida") {
    return { tipo: "vencida", texto: `Salida vencida · ${plural(nochesEntre(reserva.fechaHasta, hoy), "día", "días")}` };
  }
  return { tipo: "quedan", texto: `quedan ${plural(nochesEntre(hoy, reserva.fechaHasta), "noche", "noches")}` };
}

// "2 × Doble" / "Doble" / "3 habitaciones".
export const tipoHabitaciones = (reserva) => resumenHabitaciones(reserva).detalle;
