import { describe, expect, it } from "vitest";
import {
  avisoAtrasada,
  calcularIndicadores,
  chipHabitaciones,
  garantiaDeLlegada,
  habitacionesNoListas,
  notasDeLlegada,
  recortar,
  vistaValida,
} from "./llegadasHelpers";

const HOY = "2026-10-09";
const hab = (id, numero, estado = "libre") => ({ id, numero, tipo: "Doble", estado, adultos: 2, menores: 0 });
const llegada = (id, habitaciones, extra = {}) => ({
  id,
  fechaDesde: `${HOY}T00:00:00.000Z`,
  fechaHasta: "2026-10-11T00:00:00.000Z",
  habitaciones,
  senia: { registrada: false, importe: 0, medios: [] },
  garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" },
  ...extra,
});

describe("vistaValida", () => {
  it("una vista desconocida o ausente es Pendientes de hoy", () => {
    expect(vistaValida(null)).toBe("pendientes");
    expect(vistaValida("otra")).toBe("pendientes");
    expect(vistaValida("atrasadas")).toBe("atrasadas");
    expect(vistaValida("ingresadas")).toBe("ingresadas");
  });
});

describe("garantiaDeLlegada", () => {
  it("los cuatro casos", () => {
    expect(garantiaDeLlegada(llegada(1, [])).bloques).toEqual([{ clave: "tarjeta", tipo: "Tarjeta en garantía", detalle: ["VISA •••• 4242"] }]);
    const prepago = garantiaDeLlegada(
      llegada(1, [], { garantia: null, senia: { registrada: true, concepto: "Pago anticipado", importe: 389700, medios: [{ medioPago: "Tarjeta crédito", importe: 389700, referencia: "ref" }] } }),
    );
    expect(prepago.bloques[0]).toMatchObject({ tipo: "Prepagada", detalle: ["$ 389.700", "ref"] });
    const senia = garantiaDeLlegada(llegada(1, [], { garantia: null, senia: { registrada: true, concepto: "Seña", importe: 100, medios: [{ medioPago: "Efectivo", importe: 100, referencia: null }] } }));
    expect(senia.bloques[0].tipo).toBe("Seña");
    expect(garantiaDeLlegada(llegada(1, [], { garantia: null }))).toEqual({
      sinGarantia: true,
      bloques: [{ clave: "sin", tipo: "Sin garantía", detalle: ["tomar tarjeta al ingreso"] }],
    });
  });

  it("una seña registrada sin medios no cuenta como garantía (misma condición de siempre)", () => {
    expect(garantiaDeLlegada(llegada(1, [], { garantia: null, senia: { registrada: true, importe: 5, medios: [] } })).sinGarantia).toBe(true);
  });
});

describe("chipHabitaciones", () => {
  it("una habitación: Lista, En limpieza, Ocupada, En mantenimiento o Bloqueada", () => {
    expect(chipHabitaciones([hab(1, "101")])).toEqual({ texto: "Lista", tono: "lista" });
    expect(chipHabitaciones([hab(1, "101", "en limpieza")])).toEqual({ texto: "En limpieza", tono: "limpieza" });
    expect(chipHabitaciones([hab(1, "101", "ocupada")])).toEqual({ texto: "Ocupada", tono: "bloqueada" });
    expect(chipHabitaciones([hab(1, "101", "mantenimiento")]).texto).toBe("En mantenimiento");
    expect(chipHabitaciones([hab(1, "101", "bloqueada")]).texto).toBe("Bloqueada");
  });

  it("varias: todas libres = Lista; si no, nombra las que no lo están", () => {
    expect(chipHabitaciones([hab(1, "101"), hab(2, "102")]).texto).toBe("Lista");
    expect(chipHabitaciones([hab(1, "101"), hab(2, "403", "ocupada")])).toEqual({ texto: "403 ocupada", tono: "bloqueada" });
    expect(chipHabitaciones([hab(1, "305", "en limpieza"), hab(2, "403", "ocupada")]).texto).toBe("305 en limpieza, 403 ocupada");
    expect(chipHabitaciones([hab(1, "305", "en limpieza"), hab(2, "306")]).tono).toBe("limpieza");
  });

  it("ingresada: chip neutro 'Ocupada'", () => {
    expect(chipHabitaciones([hab(1, "101", "libre")], { ingresada: true })).toEqual({ texto: "Ocupada", tono: "neutro" });
  });
});

describe("calcularIndicadores", () => {
  const datos = {
    reservas: [llegada(1, [hab(1, "101")]), llegada(2, [hab(2, "305", "en limpieza")], { garantia: null })],
    atrasadas: [llegada(3, [hab(3, "403", "ocupada"), hab(4, "404")], { garantia: null, fechaDesde: "2026-10-08T00:00:00.000Z" })],
    ingresadasHoy: [
      llegada(4, [hab(5, "501", "ocupada")]),
      llegada(5, [hab(6, "502", "ocupada")]),
      llegada(6, [hab(7, "503", "ocupada")], { fechaDesde: "2026-10-08T00:00:00.000Z" }),
    ],
  };

  it("X de Y: ingresadas con llegada hoy (walk-ins incluidos) sobre ellas más las pendientes de hoy", () => {
    const i = calcularIndicadores(datos, HOY);
    expect(i).toMatchObject({ ingresadas: 2, pendientes: 2, totalHoy: 4 });
  });

  it("una atrasada ingresada hoy no suma al X de Y", () => {
    expect(calcularIndicadores({ ...datos, ingresadasHoy: [datos.ingresadasHoy[2]] }, HOY)).toMatchObject({ ingresadas: 0, totalHoy: 2 });
  });

  it("habitaciones no listas de pendientes y atrasadas, ordenadas; sin garantía; atrasadas", () => {
    const i = calcularIndicadores(datos, HOY);
    expect(i.noListas.map((h) => h.texto)).toEqual(["305 en limpieza", "403 ocupada"]);
    expect(i.sinGarantia).toBe(2);
    expect(i.atrasadas).toBe(1);
  });

  it("muestra hasta 3 y cuenta el resto", () => {
    const muchas = { reservas: [llegada(1, ["101", "102", "103", "104", "105"].map((n, k) => hab(k + 1, n, "ocupada")))] };
    const i = calcularIndicadores(muchas, HOY);
    expect(i.noListasVisibles).toHaveLength(3);
    expect(i.noListasExtra).toBe(2);
  });

  it("sin datos devuelve null; sin los campos nuevos no falla", () => {
    expect(calcularIndicadores(undefined, HOY)).toBeNull();
    expect(calcularIndicadores({ reservas: [] }, HOY)).toMatchObject({ ingresadas: 0, totalHoy: 0, atrasadas: 0 });
  });
});

describe("habitacionesNoListas", () => {
  it("no repite una habitación", () => {
    const h = hab(1, "305", "en limpieza");
    expect(habitacionesNoListas([llegada(1, [h]), llegada(2, [h])])).toHaveLength(1);
  });
});

describe("notas y avisos", () => {
  it("recorta a 120 caracteres con puntos suspensivos", () => {
    expect(recortar("a".repeat(120))).toHaveLength(120);
    expect(recortar("a".repeat(121))).toHaveLength(120);
    expect(recortar("a".repeat(121)).endsWith("…")).toBe(true);
  });

  it("primero las solicitudes especiales y después las preferencias; vacías no cuentan", () => {
    const r = { solicitudesEspeciales: "Cuna", titular: { preferencias: "Piso alto" } };
    expect(notasDeLlegada(r).map((n) => n.completo)).toEqual(["Cuna", "Piso alto"]);
    expect(notasDeLlegada({ solicitudesEspeciales: "  ", titular: { preferencias: null } })).toEqual([]);
  });

  it("'Llegada de ayer' y 'Llegada de ayer · sale hoy'", () => {
    expect(avisoAtrasada({ fechaHasta: "2026-10-11T00:00:00.000Z" }, HOY)).toBe("Llegada de ayer");
    expect(avisoAtrasada({ fechaHasta: "2026-10-09T00:00:00.000Z" }, HOY)).toBe("Llegada de ayer · sale hoy");
  });
});
