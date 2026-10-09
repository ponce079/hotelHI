// Helpers puros de la pantalla de Check-in (listado de llegadas). Las fechas "solo día" del backend se comparan como
// texto "YYYY-MM-DD" y "hoy" se pasa por parámetro (hoyEnHoraLocal(), hora argentina), nunca la zona del navegador.
import { formatearPrecio } from "../../../lib/moneda";
import { soloDia } from "../../../lib/formatosReserva";

export const VISTAS = [
  { valor: "pendientes", etiqueta: "Pendientes de hoy" },
  { valor: "atrasadas", etiqueta: "Atrasadas" },
  { valor: "ingresadas", etiqueta: "Ingresadas hoy" },
];

// ?vista= desconocida o ausente = Pendientes de hoy.
export const vistaValida = (valor) => (VISTAS.some((v) => v.valor === valor) ? valor : "pendientes");

// Reserva web con el documento de una ficha existente pero otro nombre declarado (regla 2.6).
export const TEXTO_NOMBRE_WEB_DISTINTO = "El nombre declarado en la web no coincide con la ficha: verificar el documento en el check-in";

// Pagos por adelantado tal cual se guardaron: la referencia del medio o "medio · importe".
export function textoSenia(senia) {
  const medios = senia?.medios ?? [];
  if (!senia?.registrada || medios.length === 0) return null;
  return medios.map((m) => m.referencia || `${m.medioPago} · ${formatearPrecio(m.importe)}`).join(" · ");
}

// Garantía de la llegada. Las condiciones de cada caso son las de siempre (tarjeta guardada en la reserva, pago por
// adelantado o seña, ninguno de los dos); solo cambia cómo se presenta: un bloque por cosa con su tipo y su detalle.
//   -> { sinGarantia, bloques: [{ clave, tipo, detalle: [texto] }] }
export function garantiaDeLlegada(r) {
  const bloques = [];
  if (r.garantia) {
    bloques.push({
      clave: "tarjeta",
      tipo: "Tarjeta en garantía",
      detalle: [`${String(r.garantia.marca ?? "").toUpperCase()} •••• ${r.garantia.ultimos4 ?? ""}`.trim()],
    });
  }
  const senia = textoSenia(r.senia);
  if (senia) {
    const importe = formatearPrecio(r.senia.importe);
    bloques.push({
      clave: "senia",
      tipo: r.senia.concepto === "Seña" ? "Seña" : "Prepagada",
      // El texto de los medios ya trae el importe cuando no hay referencia: no se repite.
      detalle: senia.includes(importe) ? [senia] : [importe, senia],
    });
  }
  if (bloques.length === 0) {
    return { sinGarantia: true, bloques: [{ clave: "sin", tipo: "Sin garantía", detalle: ["tomar tarjeta al ingreso"] }] };
  }
  return { sinGarantia: false, bloques };
}

// Estado de una habitación -> { texto, tono } para el chip. "libre" es "Lista".
const ESTADOS_HABITACION = {
  libre: { texto: "Lista", nombre: "lista", tono: "lista" },
  "en limpieza": { texto: "En limpieza", nombre: "en limpieza", tono: "limpieza" },
  ocupada: { texto: "Ocupada", nombre: "ocupada", tono: "bloqueada" },
  mantenimiento: { texto: "En mantenimiento", nombre: "en mantenimiento", tono: "bloqueada" },
  bloqueada: { texto: "Bloqueada", nombre: "bloqueada", tono: "bloqueada" },
};
const estadoDe = (estado) => ESTADOS_HABITACION[estado] ?? { texto: String(estado ?? "—"), nombre: String(estado ?? "—"), tono: "bloqueada" };

export const habitacionNoLista = (h) => h?.estado !== "libre";

// Chip de la celda Habitación. Una habitación: su estado. Varias: "Lista" si todas están libres; si no, nombra las
// que no lo están ("403 ocupada"). `ingresada`: la reserva ya ingresó, el chip es neutro "Ocupada".
export function chipHabitaciones(habitaciones, { ingresada = false } = {}) {
  if (ingresada) return { texto: "Ocupada", tono: "neutro" };
  const lista = habitaciones ?? [];
  const noListas = lista.filter(habitacionNoLista);
  if (noListas.length === 0) return { texto: "Lista", tono: "lista" };
  const tono = noListas.some((h) => estadoDe(h.estado).tono === "bloqueada") ? "bloqueada" : "limpieza";
  if (lista.length === 1) return { texto: estadoDe(noListas[0].estado).texto, tono };
  return { texto: noListas.map((h) => `${h.numero} ${estadoDe(h.estado).nombre}`).join(", "), tono };
}

// Habitaciones de las llegadas (pendientes de hoy y atrasadas) que no están libres, sin repetir, ordenadas por número.
export function habitacionesNoListas(reservas) {
  const vistas = new Map();
  for (const r of reservas) for (const h of r.habitaciones ?? []) if (habitacionNoLista(h)) vistas.set(h.id ?? h.numero, h);
  return [...vistas.values()]
    .sort((a, b) => String(a.numero).localeCompare(String(b.numero), "es", { numeric: true }))
    .map((h) => ({ numero: h.numero, estado: h.estado, texto: `${h.numero} ${estadoDe(h.estado).nombre}` }));
}

export const MAX_NO_LISTAS_VISIBLES = 3;

// Indicadores de la pantalla, siempre sin filtro de búsqueda. `datos` es la respuesta de GET /check-in/llegadas.
//   X de Y: X = ingresadas hoy con llegada hoy (walk-ins incluidos); Y = X + pendientes de hoy.
export function calcularIndicadores(datos, hoy) {
  if (!datos) return null;
  const pendientes = datos.reservas ?? [];
  const atrasadas = datos.atrasadas ?? [];
  const ingresadas = datos.ingresadasHoy ?? [];
  const ingresadasDeHoy = ingresadas.filter((r) => soloDia(r.fechaDesde) === hoy).length;
  const listadas = [...pendientes, ...atrasadas];
  const noListas = habitacionesNoListas(listadas);
  return {
    ingresadas: ingresadasDeHoy,
    totalHoy: ingresadasDeHoy + pendientes.length,
    pendientes: pendientes.length,
    noListas,
    noListasVisibles: noListas.slice(0, MAX_NO_LISTAS_VISIBLES),
    noListasExtra: Math.max(0, noListas.length - MAX_NO_LISTAS_VISIBLES),
    sinGarantia: listadas.filter((r) => garantiaDeLlegada(r).sinGarantia).length,
    atrasadas: atrasadas.length,
  };
}

// Recuadro de la celda Titular: las solicitudes especiales (reserva web) primero y después las preferencias del huésped.
export const MAX_NOTA = 120;
export function recortar(texto, max = MAX_NOTA) {
  const t = String(texto ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
export function notasDeLlegada(r) {
  return [r.solicitudesEspeciales, r.titular?.preferencias]
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .map((completo) => ({ completo, texto: recortar(completo) }));
}

// Píldora de la estadía en Atrasadas: "Llegada de ayer" o "Llegada de ayer · sale hoy".
export function avisoAtrasada(r, hoy) {
  if (soloDia(r.fechaHasta) === hoy) return "Llegada de ayer · sale hoy";
  return "Llegada de ayer";
}

// Reserva ingresada hoy cuya llegada era anterior a hoy.
export const llegabaAntes = (r, hoy) => soloDia(r.fechaDesde) < hoy;

