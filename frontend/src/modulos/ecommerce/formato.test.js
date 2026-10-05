import { describe, expect, it } from "vitest";
import {
  busquedaComoQuery,
  calcularNoches,
  formatearFecha,
  formatearPrecio,
  formatearRangoFechas,
  nombreComercialPlan,
  textoCondicionesPlan,
  textoEstadoReserva,
  textoOcupacion,
} from "./formato";

describe("formatearPrecio", () => {
  it("usa formato es-AR sin decimales cuando son ,00", () => {
    expect(formatearPrecio(50000)).toBe("$ 50.000");
    expect(formatearPrecio(1250000)).toBe("$ 1.250.000");
    expect(formatearPrecio(0)).toBe("$ 0");
  });

  it("muestra dos decimales cuando hay centavos", () => {
    expect(formatearPrecio(42500.5)).toBe("$ 42.500,50");
    expect(formatearPrecio(99.99)).toBe("$ 99,99");
  });

  it("acepta strings numéricos (Decimal serializado) y devuelve vacío si no es número", () => {
    expect(formatearPrecio("34000.00")).toBe("$ 34.000");
    expect(formatearPrecio("abc")).toBe("");
  });
});

describe("formatearFecha", () => {
  it('formatea "Vie 16 oct 2026" sin depender del huso horario', () => {
    expect(formatearFecha("2026-10-16")).toBe("Vie 16 oct 2026");
    expect(formatearFecha("2026-10-18")).toBe("Dom 18 oct 2026");
    expect(formatearFecha("2027-01-01")).toBe("Vie 1 ene 2027");
  });

  it("puede omitir el año y tolera un ISO con hora", () => {
    expect(formatearFecha("2026-10-16", { conAnio: false })).toBe("Vie 16 oct");
    expect(formatearFecha("2026-11-18T17:00:00.000Z")).toBe("Mié 18 nov 2026");
  });

  it("devuelve vacío para un valor inválido", () => {
    expect(formatearFecha("")).toBe("");
    expect(formatearFecha(null)).toBe("");
  });
});

describe("formatearRangoFechas y calcularNoches", () => {
  it("muestra el año una sola vez si coincide", () => {
    expect(formatearRangoFechas("2026-10-16", "2026-10-18")).toBe("Vie 16 oct → Dom 18 oct 2026");
  });

  it("muestra ambos años si la estadía cruza el año", () => {
    expect(formatearRangoFechas("2026-12-31", "2027-01-02")).toBe("Jue 31 dic 2026 → Sáb 2 ene 2027");
  });

  it("calcula noches entre fechas solo-día", () => {
    expect(calcularNoches("2026-10-16", "2026-10-18")).toBe(2);
    expect(calcularNoches("2026-12-31", "2027-01-02")).toBe(2);
    expect(calcularNoches("2026-10-16", "2026-10-16")).toBe(0);
  });
});

describe("textoCondicionesPlan", () => {
  it("plan reembolsable: tarifa flexible con las horas de cancelación del plan", () => {
    expect(textoCondicionesPlan({ reembolsable: true, horasCancelacionSinCargo: 48 })).toBe(
      "Cancelación sin cargo hasta 48 h antes de la llegada"
    );
    expect(textoCondicionesPlan({ reembolsable: true, horasCancelacionSinCargo: 24 })).toContain("hasta 24 h antes");
  });

  it("plan no reembolsable", () => {
    expect(textoCondicionesPlan({ reembolsable: false, horasCancelacionSinCargo: null })).toBe(
      "Se cobra el total al reservar · Sin devolución"
    );
  });

  it("sin plan devuelve vacío", () => {
    expect(textoCondicionesPlan(null)).toBe("");
  });
});

describe("otros textos", () => {
  it("ocupación en singular y plural", () => {
    expect(textoOcupacion({ adultos: 1, menores: 0 })).toBe("1 adulto");
    expect(textoOcupacion({ adultos: 2, menores: 1 })).toBe("2 adultos · 1 menor");
    expect(textoOcupacion({ adultos: 2, menores: 2 })).toBe("2 adultos · 2 menores");
  });

  it("estado de la confirmación según el plan", () => {
    expect(textoEstadoReserva({ plan: { reembolsable: true } })).toBe("Confirmada · garantizada con tarjeta");
    expect(textoEstadoReserva({ plan: { reembolsable: false } })).toBe("Pagada");
  });

  it("query de resultados", () => {
    expect(busquedaComoQuery({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 })).toBe(
      "desde=2026-10-16&hasta=2026-10-18&adultos=2&menores=0"
    );
  });
});

describe("nombreComercialPlan", () => {
  it("Tarifa flexible si es reembolsable, No reembolsable si no (el nombre de la base no cambia)", () => {
    expect(nombreComercialPlan({ codigo: "BAR", nombre: "Best Available Rate", reembolsable: true })).toBe("Tarifa flexible");
    expect(nombreComercialPlan({ codigo: "NRF", nombre: "No Reembolsable", reembolsable: false })).toBe("No reembolsable");
    expect(nombreComercialPlan(null)).toBe("");
  });
});

describe("tarjetas de plan sin el nombre repetido", () => {
  it("las condiciones no repiten el nombre comercial que ya muestra la tarjeta", () => {
    for (const plan of [{ reembolsable: true, horasCancelacionSinCargo: 48 }, { reembolsable: false, horasCancelacionSinCargo: null }]) {
      expect(textoCondicionesPlan(plan)).not.toContain(nombreComercialPlan(plan));
    }
  });
});
