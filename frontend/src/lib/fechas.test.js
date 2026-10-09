import { afterEach, describe, expect, it, vi } from "vitest";
import { etiquetaHoyConDia, formatearDiaSemanaMes, formatearIngreso, hoyEnHoraLocal } from "./fechas";

afterEach(() => vi.useRealTimers());

describe("etiquetaHoyConDia (HU-117)", () => {
  it("da día de la semana y fecha de hoy en hora argentina", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
    expect(etiquetaHoyConDia()).toBe("jue 08/10/2026");
  });

  it("después de las 21 hs argentinas sigue siendo el mismo día (no pasa a UTC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T01:30:00Z")); // 22:30 del 8/10 en Argentina
    expect(hoyEnHoraLocal()).toBe("2026-10-08");
    expect(etiquetaHoyConDia()).toBe("jue 08/10/2026");
  });
});

describe("formatearDiaSemanaMes e ingreso (Huéspedes en casa)", () => {
  it("CA10: '2026-10-08T00:00:00.000Z' es 'jue 8 oct' aunque el reloj esté a las 22:30 argentinas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T01:30:00Z"));
    expect(formatearDiaSemanaMes("2026-10-08T00:00:00.000Z")).toBe("jue 8 oct");
    expect(formatearDiaSemanaMes("2026-10-08")).toBe("jue 8 oct");
    expect(formatearDiaSemanaMes(null)).toBe("");
  });
  it("el ingreso se muestra en hora argentina", () => {
    expect(formatearIngreso("2026-10-02T13:17:00.000Z")).toEqual({ dia: "vie 2 oct", hora: "10:17 h" });
    // 01:30 UTC del 3/10 sigue siendo el 2/10 a las 22:30 en Argentina
    expect(formatearIngreso("2026-10-03T01:30:00.000Z")).toEqual({ dia: "vie 2 oct", hora: "22:30 h" });
    expect(formatearIngreso(null)).toBeNull();
  });
});
