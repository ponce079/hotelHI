import { afterEach, describe, expect, it, vi } from "vitest";
import { hoyEnHoraLocal } from "./fechas";
import {
  avisoEstadia,
  etiquetaNoches,
  etiquetaPax,
  formatearDiaConSemana,
  formatearTotal,
  iniciales,
  resumenHabitaciones,
} from "./formatosReserva";

describe("fechas sin hora", () => {
  it("muestra el día de la semana sin correrse por la zona horaria", () => {
    expect(formatearDiaConSemana("2026-10-08T00:00:00.000Z")).toBe("jue 8 oct");
    expect(formatearDiaConSemana("2026-10-11T00:00:00.000Z")).toBe("dom 11 oct");
  });
});

describe("avisoEstadia", () => {
  const confirmada = { estado: "Confirmada", fechaDesde: "2026-10-08T00:00:00.000Z", fechaHasta: "2026-10-11T00:00:00.000Z" };
  it("'Llega hoy' cuando hoy es 8/10 en hora argentina", () => {
    expect(avisoEstadia(confirmada, "2026-10-08")).toBe("Llega hoy");
  });
  it("Llegada atrasada, y sin aviso para una llegada futura", () => {
    expect(avisoEstadia(confirmada, "2026-10-09")).toBe("Llegada atrasada");
    expect(avisoEstadia(confirmada, "2026-10-07")).toBeNull();
  });
  it("En curso: Sale hoy / Salida vencida", () => {
    const enCurso = { ...confirmada, estado: "En curso" };
    expect(avisoEstadia(enCurso, "2026-10-11")).toBe("Sale hoy");
    expect(avisoEstadia(enCurso, "2026-10-12")).toBe("Salida vencida");
    expect(avisoEstadia(enCurso, "2026-10-10")).toBeNull();
  });
  it("las demás reservas no llevan aviso", () => {
    expect(avisoEstadia({ ...confirmada, estado: "Cerrada" }, "2026-10-12")).toBeNull();
    expect(avisoEstadia({ ...confirmada, estado: "Cancelada" }, "2026-10-08")).toBeNull();
  });
});

describe("avisoEstadia con el 'hoy' real en hora argentina", () => {
  afterEach(() => vi.useRealTimers());
  const llegaElOcho = { estado: "Confirmada", fechaDesde: "2026-10-08T00:00:00.000Z", fechaHasta: "2026-10-11T00:00:00.000Z" };
  it("08/10 a las 12:00 UTC (09:00 ART): Llega hoy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    expect(hoyEnHoraLocal()).toBe("2026-10-08");
    expect(avisoEstadia(llegaElOcho, hoyEnHoraLocal())).toBe("Llega hoy");
  });
  it("09/10 a las 01:00 UTC (22:00 ART del 8): sigue siendo hoy el 8", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T01:00:00Z"));
    expect(hoyEnHoraLocal()).toBe("2026-10-08");
    expect(avisoEstadia(llegaElOcho, hoyEnHoraLocal())).toBe("Llega hoy");
  });
});

describe("textos de la fila", () => {
  it("noches en singular y plural", () => {
    expect(etiquetaNoches({ noches: 1 })).toBe("1 noche");
    expect(etiquetaNoches({ noches: 3 })).toBe("3 noches");
  });
  it("pax", () => {
    expect(etiquetaPax({ habitaciones: [{ adultos: 1, menores: 0 }] })).toBe("1 adulto");
    expect(etiquetaPax({ habitaciones: [{ adultos: 1, menores: 0 }, { adultos: 1, menores: 0 }] })).toBe("2 adultos");
    expect(etiquetaPax({ habitaciones: [{ adultos: 2, menores: 1 }] })).toBe("2 ad · 1 men");
  });
  it("habitaciones: una, varias del mismo tipo y tipos distintos", () => {
    expect(resumenHabitaciones({ habitaciones: [{ numero: "204", tipo: "Doble superior" }] })).toEqual({
      numeros: "204",
      detalle: "Doble superior",
    });
    expect(
      resumenHabitaciones({
        habitaciones: [
          { numero: "204", tipo: "Doble superior" },
          { numero: "205", tipo: "Doble superior" },
        ],
      })
    ).toEqual({ numeros: "204 · 205", detalle: "2 × Doble superior" });
    expect(
      resumenHabitaciones({
        habitaciones: [
          { numero: "1", tipo: "A" },
          { numero: "2", tipo: "B" },
        ],
      }).detalle
    ).toBe("2 habitaciones");
  });
  it("iniciales", () => {
    expect(iniciales("Ana María Pérez")).toBe("AP");
    expect(iniciales("Ana")).toBe("A");
    expect(iniciales("")).toBe("?");
  });
  it("total en es-AR", () => {
    expect(formatearTotal(412500)).toBe("$ 412.500");
    expect(formatearTotal(412500.5)).toBe("$ 412.500,50");
  });
});
