// Funciones PURAS de la búsqueda web (etapa 2): la búsqueda en la URL,
// el orden de los resultados, el ahorro del no reembolsable y los textos de
// resumen. Testeadas en busquedaWeb.test.js.
import { validarBusquedaWeb } from "./componentes/BuscadorEstadia";
import { calcularNoches } from "./formato";

// Ventana de venta: se puede reservar con hasta un año de anticipación.
export const VENTANA_VENTA_DIAS = 365;

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const PATRON_ENTERO = /^\d+$/;

// Lee la búsqueda de la URL de /web/resultados (o del detalle del tipo):
// ?entrada=AAAA-MM-DD&salida=AAAA-MM-DD&adultos=N&menores=N. También acepta
// los nombres de la etapa 1 (?desde&hasta) para no romper links viejos.
// Devuelve { busqueda, valida, errores }:
//   - sin parámetros de fecha → busqueda null (no hay búsqueda en la URL);
//   - con parámetros → la búsqueda leída (para precargar el buscador) y si
//     es válida con las reglas del buscador web.
export function leerBusquedaDeUrl(searchParams, { hoy, capacidadMaxima } = {}) {
  const entrada = searchParams.get("entrada") ?? searchParams.get("desde");
  const salida = searchParams.get("salida") ?? searchParams.get("hasta");
  if (entrada === null && salida === null) return { busqueda: null, valida: false, errores: {} };

  const adultosTexto = searchParams.get("adultos") ?? "2";
  const menoresTexto = searchParams.get("menores") ?? "0";
  const busqueda = {
    fechaDesde: PATRON_FECHA.test(entrada ?? "") ? entrada : "",
    fechaHasta: PATRON_FECHA.test(salida ?? "") ? salida : "",
    adultos: PATRON_ENTERO.test(adultosTexto) ? Number(adultosTexto) : 0,
    menores: PATRON_ENTERO.test(menoresTexto) ? Number(menoresTexto) : -1,
  };
  const errores = validarBusquedaWeb(busqueda, { hoy, capacidadMaxima, ventanaVentaDias: VENTANA_VENTA_DIAS });
  const valida = Object.keys(errores).length === 0;
  return {
    busqueda: { ...busqueda, adultos: busqueda.adultos || 2, menores: busqueda.menores < 0 ? 0 : busqueda.menores },
    valida,
    errores,
  };
}

// Query string con los nombres de la etapa 2.
export function busquedaComoQueryWeb({ fechaDesde, fechaHasta, adultos, menores }) {
  return new URLSearchParams({
    entrada: fechaDesde,
    salida: fechaHasta,
    adultos: String(adultos),
    menores: String(menores ?? 0),
  }).toString();
}

const disponible = (tipo) => (tipo.planes?.length ?? 0) > 0 && !tipo.motivoNoDisponible;

// Disponibles primero, por desdePorNoche ascendente (desempate por nombre);
// los no disponibles al final, en el orden en que vinieron.
export function ordenarTipos(tipos) {
  const lista = Array.isArray(tipos) ? tipos : [];
  const si = lista.filter(disponible).sort((a, b) => a.desdePorNoche - b.desdePorNoche || a.nombre.localeCompare(b.nombre, "es"));
  const no = lista.filter((t) => !disponible(t));
  return [...si, ...no];
}

export function hayDisponibles(tipos) {
  return (tipos ?? []).some(disponible);
}

// "Ahorrás $ X" del no reembolsable: la diferencia de totales contra la
// tarifa flexible (reembolsable) del MISMO tipo. null si el plan es
// reembolsable, si no hay flexible para comparar o si no hay ahorro.
export function ahorroContraFlexible(planes, plan) {
  if (!plan || plan.reembolsable) return null;
  const flexibles = (planes ?? []).filter((p) => p.reembolsable);
  if (flexibles.length === 0) return null;
  const referencia = Math.min(...flexibles.map((p) => Number(p.total)));
  const ahorro = Math.round((referencia - Number(plan.total)) * 100) / 100;
  return ahorro > 0 ? ahorro : null;
}

// Motivo más relevante cuando NINGÚN tipo está disponible: si alguno no
// tiene habitaciones libres, ese; si no, el primero que haya.
export function motivoMasRelevante(tipos) {
  const motivos = (tipos ?? []).map((t) => t.motivoNoDisponible).filter(Boolean);
  return motivos.find((m) => /sin disponibilidad/i.test(m)) ?? motivos[0] ?? null;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// "2 noches · 2 adultos · 1 menor" (sin los ceros).
export function textoResumenBusqueda({ fechaDesde, fechaHasta, adultos, menores }) {
  const partes = [];
  const noches = calcularNoches(fechaDesde, fechaHasta);
  if (noches > 0) partes.push(plural(noches, "noche", "noches"));
  if (adultos > 0) partes.push(plural(adultos, "adulto", "adultos"));
  if (menores > 0) partes.push(plural(menores, "menor", "menores"));
  return partes.join(" · ");
}

// Capacidad máxima entre los tipos (de /api/web/tipos). Nunca un número fijo.
export function capacidadMaximaDeTipos(tipos) {
  const capacidades = (tipos ?? []).map((t) => Number(t.capacidadMaxima)).filter((n) => n > 0);
  return capacidades.length ? Math.max(...capacidades) : undefined;
}

// Texto de no-show de un plan (PlanTarifario.penalidadNoShow).
export function textoNoShow(penalidadNoShow) {
  if (penalidadNoShow === "PRIMERA_NOCHE") return "Si no te presentás, se cobra la primera noche.";
  if (penalidadNoShow === "TOTAL_ESTADIA") return "Si no te presentás, se cobra el total de la estadía.";
  return "";
}
