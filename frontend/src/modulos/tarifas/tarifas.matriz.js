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
