import { describe, expect, it } from "vitest";
import {
  esTemporadaPasada,
  ordenarTemporadas,
  prepararFilasMatriz,
  prepararFilasTemporadas,
  textoAdicionalMatriz,
  textoDiasTemporada,
  textoPrecioMatriz,
  textoRangoTemporada,
  textoRestriccionesTemporada,
} from "./tarifas.matriz";

const base = { id: 1, nivel: "BASE", fechaDesde: null, fechaHasta: null };
const pasada = { id: 2, nivel: "ALTA", fechaDesde: "2026-01-05T00:00:00.000Z", fechaHasta: "2026-01-20T00:00:00.000Z" };
const octubre = { id: 3, nivel: "EVENTO", fechaDesde: "2026-10-09T00:00:00.000Z", fechaHasta: "2026-10-12T00:00:00.000Z" };
const diciembre = { id: 4, nivel: "ALTA", fechaDesde: "2026-12-20T00:00:00.000Z", fechaHasta: "2027-01-10T00:00:00.000Z" };
const HOY = "2026-10-09";

describe("esTemporadaPasada", () => {
  it("la Base nunca es pasada", () => expect(esTemporadaPasada(base, HOY)).toBe(false));
  it("termina antes de hoy: pasada", () => expect(esTemporadaPasada(pasada, HOY)).toBe(true));
  it("termina hoy: todavía no es pasada", () => {
    expect(esTemporadaPasada({ ...octubre, fechaHasta: "2026-10-09T00:00:00.000Z" }, HOY)).toBe(false);
  });
  it("futura: no es pasada", () => expect(esTemporadaPasada(diciembre, HOY)).toBe(false));
});

describe("ordenarTemporadas", () => {
  it("Base primero y el resto por fecha de inicio ascendente", () => {
    const orden = ordenarTemporadas([diciembre, pasada, octubre, base]).map((t) => t.id);
    expect(orden).toEqual([1, 2, 3, 4]);
  });
  it("no muta el arreglo original", () => {
    const original = [diciembre, base];
    ordenarTemporadas(original);
    expect(original[0]).toBe(diciembre);
  });
});

describe("prepararFilasMatriz", () => {
  it("oculta las pasadas por defecto", () => {
    expect(prepararFilasMatriz([diciembre, pasada, octubre, base], HOY, false).map((f) => f.temporada.id)).toEqual([1, 3, 4]);
  });
  it("con el interruptor las agrega al final, marcadas", () => {
    const filas = prepararFilasMatriz([diciembre, pasada, octubre, base], HOY, true);
    expect(filas.map((f) => f.temporada.id)).toEqual([1, 3, 4, 2]);
    expect(filas.map((f) => f.pasada)).toEqual([false, false, false, true]);
  });
});

describe("formato de precio", () => {
  it("sin decimales cuando terminan en ,00", () => {
    expect(textoPrecioMatriz({ precioBase: "60000.00" })).toBe("$ 60.000");
    expect(textoPrecioMatriz({ precioBase: 60000 })).not.toContain(",00");
  });
  it("conserva centavos reales", () => expect(textoPrecioMatriz({ precioBase: "60000.50" })).toBe("$ 60.000,50"));
  it("adicional de adulto extra", () => {
    expect(textoAdicionalMatriz({ adicionalAdultoExtra: "6000.00" })).toBe("+$ 6.000 adulto extra");
  });
  it("adicional en cero o ausente: no se muestra", () => {
    expect(textoAdicionalMatriz({ adicionalAdultoExtra: "0.00" })).toBeNull();
    expect(textoAdicionalMatriz({ adicionalAdultoExtra: null })).toBeNull();
  });
});

describe("prepararFilasTemporadas", () => {
  const baja = { id: 5, nivel: "MEDIA", activa: false, fechaDesde: "2026-11-01T00:00:00.000Z", fechaHasta: "2026-11-10T00:00:00.000Z" };
  const ids = (filas) => filas.map((f) => f.temporada.id);
  const todas = [diciembre, baja, pasada, octubre, base];
  it("por defecto: Base primero, por fecha, sin pasadas ni bajas", () => {
    expect(ids(prepararFilasTemporadas(todas, HOY))).toEqual([1, 3, 4]);
  });
  it("con pasadas y bajas van al final y quedan marcadas", () => {
    const filas = prepararFilasTemporadas(todas, HOY, { mostrarPasadas: true, mostrarBajas: true });
    expect(ids(filas)).toEqual([1, 3, 4, 2, 5]);
    expect(filas.find((f) => f.temporada.id === 2).pasada).toBe(true);
    expect(filas.find((f) => f.temporada.id === 5).baja).toBe(true);
  });
  it("solo bajas: las pasadas siguen ocultas", () => {
    expect(ids(prepararFilasTemporadas(todas, HOY, { mostrarBajas: true }))).toEqual([1, 3, 4, 5]);
  });
});

describe("textoRangoTemporada", () => {
  it("mismo año actual: sin año", () => {
    expect(textoRangoTemporada(octubre, HOY)).toBe("vie 9 oct → lun 12 oct");
  });
  it("extremos en años distintos: año al final", () => {
    expect(textoRangoTemporada(diciembre, HOY)).toBe("dom 20 dic → dom 10 ene 2027");
  });
  it("mismo año pero no el actual: con año", () => {
    const t = { nivel: "ALTA", fechaDesde: "2027-02-01T00:00:00.000Z", fechaHasta: "2027-02-10T00:00:00.000Z" };
    expect(textoRangoTemporada(t, HOY)).toBe("lun 1 feb → mié 10 feb 2027");
  });
  it("Base: resto de las fechas", () => expect(textoRangoTemporada(base, HOY)).toBe("Resto de las fechas"));
});

describe("textoDiasTemporada", () => {
  it("cuenta ambos extremos", () => expect(textoDiasTemporada(octubre)).toBe("4 días"));
  it("cruza de año", () => expect(textoDiasTemporada(diciembre)).toBe("22 días"));
  it("un solo día en singular", () => {
    expect(textoDiasTemporada({ nivel: "EVENTO", fechaDesde: "2026-10-09", fechaHasta: "2026-10-09" })).toBe("1 día");
  });
  it("Base: null", () => expect(textoDiasTemporada(base)).toBeNull());
});

describe("textoRestriccionesTemporada", () => {
  it("sin restricciones: vacío", () => expect(textoRestriccionesTemporada({ estadiaMinima: null, cierreLlegada: false })).toBe(""));
  it("solo estadía mínima", () => expect(textoRestriccionesTemporada({ estadiaMinima: 3, cierreLlegada: false })).toBe("Mín. 3 noches"));
  it("solo cierre a llegadas", () => expect(textoRestriccionesTemporada({ estadiaMinima: 0, cierreLlegada: true })).toBe("Cierre a llegadas"));
  it("ambas, separadas por ·", () => expect(textoRestriccionesTemporada({ estadiaMinima: 3, cierreLlegada: true })).toBe("Mín. 3 noches · Cierre a llegadas"));
});
