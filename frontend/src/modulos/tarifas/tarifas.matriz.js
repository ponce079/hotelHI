import { formatearPrecio } from "../../lib/moneda";

// Helpers puros de la matriz de tarifas (filas = temporadas, columnas = tipos de habitación).

const dia = (valor) => (valor ? String(valor).slice(0, 10) : null);

// La temporada Base no tiene fechas y nunca "termina".
export function esTemporadaPasada(temporada, hoy) {
  if (temporada.nivel === "BASE") return false;
  const hasta = dia(temporada.fechaHasta);
  return hasta !== null && hasta < hoy;
}

// Base primero; después por fecha de inicio ascendente (empate: por id, para que el orden sea estable).
export function ordenarTemporadas(temporadas) {
  const clave = (t) => (t.nivel === "BASE" ? "" : (dia(t.fechaDesde) ?? "9999-99-99"));
  return [...temporadas].sort((a, b) => {
    const porBase = Number(b.nivel === "BASE") - Number(a.nivel === "BASE");
    if (porBase !== 0) return porBase;
    return clave(a).localeCompare(clave(b)) || a.id - b.id;
  });
}

// Filas visibles: las vigentes/futuras ordenadas y, si se pide, las pasadas al final, marcadas como tales.
export function prepararFilasMatriz(temporadas, hoy, mostrarPasadas) {
  const ordenadas = ordenarTemporadas(temporadas);
  const vigentes = ordenadas.filter((t) => !esTemporadaPasada(t, hoy)).map((temporada) => ({ temporada, pasada: false }));
  if (!mostrarPasadas) return vigentes;
  const pasadas = ordenadas.filter((t) => esTemporadaPasada(t, hoy)).map((temporada) => ({ temporada, pasada: true }));
  return [...vigentes, ...pasadas];
}

// "$ 60.000" (sin ",00"); con centavos reales conserva "$ 60.000,50".
export function textoPrecioMatriz(tarifa) {
  return formatearPrecio(tarifa.precioBase);
}

// "+$ 6.000 adulto extra", solo si el adicional es mayor a 0; si no, null.
export function textoAdicionalMatriz(tarifa) {
  const monto = Number(tarifa.adicionalAdultoExtra);
  return monto > 0 ? `+${formatearPrecio(monto)} adulto extra` : null;
}

// ---------- Lista de temporadas (pestaña Temporadas) ----------

// Filas de la lista: las activas vigentes/futuras ordenadas y, al final, las atenuadas que se pidieron
// (terminadas y/o dadas de baja). Una fila lleva `pasada` y `baja` para atenuarla y rotularla.
export function prepararFilasTemporadas(temporadas, hoy, { mostrarPasadas = false, mostrarBajas = false } = {}) {
  const filas = ordenarTemporadas(temporadas).map((temporada) => ({
    temporada,
    pasada: esTemporadaPasada(temporada, hoy),
    baja: temporada.activa === false,
  }));
  const visibles = filas.filter((f) => (!f.pasada || mostrarPasadas) && (!f.baja || mostrarBajas));
  return [...visibles.filter((f) => !f.pasada && !f.baja), ...visibles.filter((f) => f.pasada || f.baja)];
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partesDia(valor) {
  const [anio, mes, d] = dia(valor).split("-").map(Number);
  return { anio, mes, d, semana: new Date(Date.UTC(anio, mes - 1, d)).getUTCDay() };
}

const tieneFechas = (t) => t.nivel !== "BASE" && dia(t.fechaDesde) && dia(t.fechaHasta);

// "dom 20 dic → dom 31 ene 2027". El año (solo al final) aparece si no es el actual o si los extremos caen en
// años distintos. La Base no tiene fechas.
export function textoRangoTemporada(temporada, hoy) {
  if (!tieneFechas(temporada)) return "Resto de las fechas";
  const desde = partesDia(temporada.fechaDesde);
  const hasta = partesDia(temporada.fechaHasta);
  const conAnio = desde.anio !== hasta.anio || hasta.anio !== Number(hoy.slice(0, 4));
  const corto = (p) => `${DIAS[p.semana]} ${p.d} ${MESES[p.mes - 1]}`;
  return `${corto(desde)} → ${corto(hasta)}${conAnio ? ` ${hasta.anio}` : ""}`;
}

// "12 días" (ambos extremos incluidos); null para la Base.
export function textoDiasTemporada(temporada) {
  if (!tieneFechas(temporada)) return null;
  const desde = partesDia(temporada.fechaDesde);
  const hasta = partesDia(temporada.fechaHasta);
  const dias = Math.round((Date.UTC(hasta.anio, hasta.mes - 1, hasta.d) - Date.UTC(desde.anio, desde.mes - 1, desde.d)) / 86400000) + 1;
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}

// "Mín. 3 noches · Cierre a llegadas": solo lo que exista; sin restricciones, cadena vacía.
export function textoRestriccionesTemporada(temporada) {
  const partes = [];
  if (temporada.estadiaMinima > 0) partes.push(`Mín. ${temporada.estadiaMinima} ${temporada.estadiaMinima === 1 ? "noche" : "noches"}`);
  if (temporada.cierreLlegada) partes.push("Cierre a llegadas");
  return partes.join(" · ");
}
