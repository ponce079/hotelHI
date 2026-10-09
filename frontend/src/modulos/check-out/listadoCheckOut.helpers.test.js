import { describe, expect, it } from "vitest";
import { contarSalidas } from "../../lib/useContadoresRecepcion";
import {
  avisoSalida,
  calcularIndicadores,
  clasificar,
  filtrarPorVista,
  ordenarSalidas,
  tipoHabitaciones,
  vistaPorDefecto,
  vistaValida,
} from "./listadoCheckOut.helpers";

const HOY = "2026-10-09";
const r = (id, hasta, extra = {}) => ({
  id,
  estado: "En curso",
  fechaDesde: "2026-10-05T00:00:00.000Z",
  fechaHasta: `${hasta}T00:00:00.000Z`,
  habitaciones: [{ numero: String(400 + id), tipo: "Doble", adultos: 2, menores: 0 }],
  ...extra,
});

describe("clasificar y ordenar", () => {
  it("compara fechas sin hora, sin corrimiento", () => {
    expect(clasificar(r(1, "2026-10-08"), HOY)).toBe("vencida");
    expect(clasificar(r(2, "2026-10-09"), HOY)).toBe("hoy");
    expect(clasificar(r(3, "2026-10-10"), HOY)).toBe("resto");
  });

  it("ordena vencidas, después hoy, después el resto, cada grupo por fechaHasta ascendente", () => {
    const lista = [r(1, "2026-10-12"), r(2, "2026-10-09"), r(3, "2026-10-07"), r(4, "2026-10-10"), r(5, "2026-10-08")];
    expect(ordenarSalidas(lista, HOY).map((x) => x.id)).toEqual([3, 5, 2, 4, 1]);
  });

  it("no modifica el arreglo original", () => {
    const lista = [r(1, "2026-10-12"), r(2, "2026-10-07")];
    ordenarSalidas(lista, HOY);
    expect(lista.map((x) => x.id)).toEqual([1, 2]);
  });

  it("filtra por vista", () => {
    const lista = [r(1, "2026-10-07"), r(2, "2026-10-09"), r(3, "2026-10-11")];
    expect(filtrarPorVista(lista, "hoy", HOY).map((x) => x.id)).toEqual([2]);
    expect(filtrarPorVista(lista, "vencidas", HOY).map((x) => x.id)).toEqual([1]);
    expect(filtrarPorVista(lista, "todas", HOY)).toHaveLength(3);
  });
});

describe("indicadores", () => {
  const lista = [
    r(1, "2026-10-07"),
    r(2, "2026-10-09"),
    r(3, "2026-10-09", { habitaciones: [{ numero: "1" }, { numero: "2" }] }),
    r(4, "2026-10-12"),
  ];

  it("cuenta salen hoy, vencidas, en casa y habitaciones", () => {
    expect(calcularIndicadores(lista, HOY)).toEqual({ salenHoy: 2, vencidas: 1, enCasa: 4, habitaciones: 5 });
  });

  it("coinciden con el badge del menú (salen hoy + vencidas)", () => {
    const i = calcularIndicadores(lista, HOY);
    expect(contarSalidas(lista, HOY).salidas).toBe(i.salenHoy + i.vencidas);
  });

  it("devuelve null sin datos", () => {
    expect(calcularIndicadores(undefined, HOY)).toBeNull();
  });
});

describe("pestaña por defecto y vista", () => {
  it("Vencidas si hay, si no Salen hoy", () => {
    expect(vistaPorDefecto(2)).toBe("vencidas");
    expect(vistaPorDefecto(0)).toBe("hoy");
  });
  it("ignora valores desconocidos", () => {
    expect(vistaValida("todas")).toBe("todas");
    expect(vistaValida("x")).toBeNull();
    expect(vistaValida(null)).toBeNull();
  });
});

describe("avisoSalida", () => {
  it("Sale hoy", () => expect(avisoSalida(r(1, "2026-10-09"), HOY)).toEqual({ tipo: "hoy", texto: "Sale hoy" }));
  it("Salida vencida con días", () => {
    expect(avisoSalida(r(1, "2026-10-08"), HOY).texto).toBe("Salida vencida · 1 día");
    expect(avisoSalida(r(1, "2026-10-06"), HOY).texto).toBe("Salida vencida · 3 días");
  });
  it("quedan N noches", () => {
    expect(avisoSalida(r(1, "2026-10-10"), HOY).texto).toBe("quedan 1 noche");
    expect(avisoSalida(r(1, "2026-10-13"), HOY).texto).toBe("quedan 4 noches");
  });
});

describe("tipos de habitación", () => {
  it("agrupa el tipo de varias habitaciones", () => {
    const x = r(1, "2026-10-09", {
      habitaciones: [
        { numero: "1", tipo: "Doble", adultos: 2, menores: 1 },
        { numero: "2", tipo: "Doble", adultos: 2, menores: 0 },
      ],
    });
    expect(tipoHabitaciones(x)).toBe("2 × Doble");
  });
});
