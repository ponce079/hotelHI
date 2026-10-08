import { afterEach, describe, expect, it, vi } from "vitest";
import { etiquetaHoyConDia, hoyEnHoraLocal } from "./fechas";

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
