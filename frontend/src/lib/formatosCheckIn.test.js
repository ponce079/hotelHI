import { afterEach, describe, expect, it, vi } from "vitest";
import { formatearPrecio } from "./moneda";
import {
  ddMmAaaaAISO,
  edadEnFecha,
  formatearDiaCorto,
  formatearDiaLargo,
  formatearFechaDdMmAaaa,
  formatearFechaOperacion,
  hoyEnHoraLocal,
  mascaraFecha,
  nochesEntre,
  sumarDiasISO,
} from "./fechas";

describe("formatearPrecio", () => {
  it("punto de miles, sin decimales si es entero y con 2 si no", () => {
    expect(formatearPrecio(40000)).toBe("$ 40.000");
    expect(formatearPrecio(1234567)).toBe("$ 1.234.567");
    expect(formatearPrecio(40000.5)).toBe("$ 40.000,50");
    expect(formatearPrecio(0)).toBe("$ 0");
    expect(formatearPrecio(-22000)).toBe("−$ 22.000");
  });
});

describe("fechas del check-in", () => {
  it("dd/mm/aaaa con ceros y días en español, sin correr el día por la zona horaria", () => {
    expect(formatearFechaDdMmAaaa("2026-10-02T00:00:00.000Z")).toBe("02/10/2026");
    expect(formatearFechaDdMmAaaa("2026-10-02")).toBe("02/10/2026");
    expect(formatearDiaCorto("2026-10-02")).toBe("vie 02/10");
    expect(formatearDiaLargo("2026-10-05")).toBe("lun 05/10/2026");
    expect(formatearFechaOperacion("2026-10-01")).toBe("Jueves 01/10/2026");
    expect(sumarDiasISO("2026-10-30", 3)).toBe("2026-11-02");
    expect(nochesEntre("2026-10-02", "2026-10-05")).toBe(3);
  });

  it("máscara y conversión de la fecha tipeada", () => {
    expect(mascaraFecha("14031987")).toBe("14/03/1987");
    expect(mascaraFecha("1403")).toBe("14/03");
    expect(ddMmAaaaAISO("14/03/1987")).toBe("1987-03-14");
    expect(ddMmAaaaAISO("31/02/2020")).toBeNull();
    expect(ddMmAaaaAISO("1987-03-14")).toBeNull();
  });

  it("edad cumplida a una fecha", () => {
    expect(edadEnFecha("2013-10-02", "2026-10-01")).toBe(12);
    expect(edadEnFecha("2013-10-01", "2026-10-01")).toBe(13);
  });
});

// Encabezado del check-in: el día de operación es el de Argentina, a cualquier hora.
describe("hoyEnHoraLocal y el encabezado", () => {
  afterEach(() => vi.useRealTimers());
  const hoyA = (instante) => {
    vi.useFakeTimers({ now: new Date(instante) });
    return hoyEnHoraLocal();
  };
  it("a las 02:43 del 03/10 en Argentina es el 03/10", () => {
    expect(hoyA("2026-10-03T05:43:00Z")).toBe("2026-10-03");
    expect(formatearFechaOperacion(hoyEnHoraLocal())).toBe("Sábado 03/10/2026");
  });
  it("a las 23:59 del 02/10 en Argentina sigue siendo el 02/10", () => {
    expect(hoyA("2026-10-03T02:59:00Z")).toBe("2026-10-02");
  });
});
