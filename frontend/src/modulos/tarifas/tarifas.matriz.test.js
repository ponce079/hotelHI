import { describe, expect, it } from "vitest";
import { esTemporadaPasada, ordenarTemporadas, prepararFilasMatriz, textoAdicionalMatriz, textoPrecioMatriz } from "./tarifas.matriz";

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
