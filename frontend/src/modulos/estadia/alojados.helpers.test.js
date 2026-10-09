import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agruparPorHabitacion,
  calcularIndicadores,
  edadDe,
  esMenor,
  estadoSalida,
  filtrarPorVista,
  iniciales,
  lineaDocumento,
  notasOcupante,
  ordenarOcupantes,
  textoMismaReserva,
  VISTAS,
} from "./alojados.helpers";

afterEach(() => vi.useRealTimers());

const HOY = "2026-10-08";
let secuencia = 0;
function persona(extra = {}) {
  secuencia += 1;
  const { habitacion = "412", reservaId = 1, ...resto } = extra;
  const habitacionId = Number(habitacion) || 999;
  return {
    id: secuencia,
    reservaId,
    nombre: "Ana",
    apellido: "Pérez",
    esTitular: false,
    tipoDocumento: "DNI",
    numeroDocumento: "30124127",
    paisDocumento: "AR",
    fechaNacimiento: "1985-03-14T00:00:00.000Z",
    fechaDesde: "2026-10-06T00:00:00.000Z",
    fechaHasta: "2026-10-10T00:00:00.000Z",
    ingresoReal: "2026-10-06T14:00:00.000Z",
    asignaciones: habitacion === null ? [] : [{ habitacionId, hasta: null, desde: "2026-10-06T14:00:00.000Z" }],
    reserva: {
      codigoConfirmacion: `RES-${reservaId}`,
      reservaHabitaciones: [
        { habitacionId, habitacion: { id: habitacionId, numero: habitacion ?? "0", tipoHabitacion: { nombre: "Doble" } } },
      ],
    },
    ...resto,
  };
}

describe("edad y menor", () => {
  it("menor de 18 a hoy, y 18 cumplidos hoy ya no lo es", () => {
    expect(esMenor(persona({ fechaNacimiento: "2015-05-01T00:00:00.000Z" }), HOY)).toBe(true);
    expect(edadDe(persona({ fechaNacimiento: "2015-05-01T00:00:00.000Z" }), HOY)).toBe(11);
    expect(esMenor(persona({ fechaNacimiento: "2008-10-08T00:00:00.000Z" }), HOY)).toBe(false);
    expect(esMenor(persona({ fechaNacimiento: "2008-10-09T00:00:00.000Z" }), HOY)).toBe(true);
  });
  it("sin fecha de nacimiento no se marca como menor", () => {
    expect(esMenor(persona({ fechaNacimiento: null }), HOY)).toBe(false);
  });
  it("iniciales", () => {
    expect(iniciales({ nombre: "mónica", apellido: "lindero" })).toBe("ML");
    expect(iniciales({ nombre: "", apellido: "" })).toBe("?");
  });
});

describe("orden y agrupamiento (CA1)", () => {
  it("una fila por habitación, con orden numérico (130 antes que 409) y 'sin habitación' al final", () => {
    const grupos = agruparPorHabitacion(
      [
        persona({ habitacion: "409" }),
        persona({ habitacion: null }),
        persona({ habitacion: "130" }),
        persona({ habitacion: "409" }),
        persona({ habitacion: "1010" }),
      ],
      HOY,
    );
    expect(grupos.map((g) => g.numero)).toEqual(["130", "409", "1010", null]);
    expect(grupos[1].ocupantes).toHaveLength(2);
  });
  it("titular primero, luego adultos por apellido y al final los menores", () => {
    const menor = persona({ apellido: "Aaa", fechaNacimiento: "2018-01-01T00:00:00.000Z" });
    const zeta = persona({ apellido: "Zeta" });
    const beta = persona({ apellido: "Beta" });
    const titular = persona({ apellido: "Ruiz", esTitular: true });
    expect(ordenarOcupantes([menor, zeta, beta, titular], HOY).map((p) => p.apellido)).toEqual([
      "Ruiz",
      "Beta",
      "Zeta",
      "Aaa",
    ]);
  });
  it("tipo de habitación, código, ingreso más temprano y salida más tardía", () => {
    const [g] = agruparPorHabitacion(
      [
        persona({ ingresoReal: "2026-10-07T15:00:00.000Z", fechaHasta: "2026-10-09T00:00:00.000Z" }),
        persona({ ingresoReal: "2026-10-06T14:00:00.000Z", fechaHasta: "2026-10-11T00:00:00.000Z" }),
      ],
      HOY,
    );
    expect(g.tipo).toBe("Doble");
    expect(g.codigo).toBe("RES-1");
    expect(g.ingreso).toBe("2026-10-06T14:00:00.000Z");
    expect(g.salida).toBe("2026-10-11");
  });
  it("ignora una asignación cerrada (hasta) y usa la activa", () => {
    const p = persona({ habitacion: "412" });
    p.asignaciones = [
      { habitacionId: 5, hasta: "2026-10-07T10:00:00Z" },
      { habitacionId: 412, hasta: null },
    ];
    expect(agruparPorHabitacion([p], HOY)[0].numero).toBe("412");
  });
});

describe("avisos de salida (CA4)", () => {
  it("hoy, vencida y noches restantes", () => {
    expect(estadoSalida("2026-10-08T00:00:00.000Z", HOY)).toMatchObject({ tipo: "hoy", texto: "Sale hoy" });
    expect(estadoSalida("2026-10-07T00:00:00.000Z", HOY)).toMatchObject({ tipo: "vencida", texto: "Salida vencida" });
    expect(estadoSalida("2026-10-09T00:00:00.000Z", HOY)).toMatchObject({ tipo: "noches", noches: 1, texto: "queda 1 noche" });
    expect(estadoSalida("2026-10-12T00:00:00.000Z", HOY)).toMatchObject({ noches: 4, texto: "quedan 4 noches" });
  });
  it("a las 22:30 argentinas del 8/10 (01:30 UTC del 9/10) una salida del 8/10 es 'Sale hoy', no 'Vencida'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T01:30:00Z"));
    const lista = [persona({ fechaHasta: "2026-10-08T00:00:00.000Z" })];
    const [g] = agruparPorHabitacion(lista);
    expect(g.estadoSalida.tipo).toBe("hoy");
    expect(g.estadoSalida.texto).toBe("Sale hoy");
    expect(calcularIndicadores(lista).salenHoy.habitaciones).toBe(1);
    expect(calcularIndicadores(lista).vencidas.habitaciones).toBe(0);
  });
  it("las notas por ocupante: 'sale <fecha>' si se va antes e 'ingresó <fecha>' si entró otro día", () => {
    const tarde = persona({ ingresoReal: "2026-10-07T15:00:00.000Z", fechaHasta: "2026-10-09T00:00:00.000Z" });
    const base = persona({ ingresoReal: "2026-10-06T14:00:00.000Z", fechaHasta: "2026-10-11T00:00:00.000Z" });
    const [g] = agruparPorHabitacion([tarde, base], HOY);
    expect(notasOcupante(tarde, g)).toEqual({ ingreso: "ingresó mié 7 oct", salida: "sale vie 9 oct" });
    expect(notasOcupante(base, g)).toEqual({ ingreso: "", salida: "" });
  });
});

describe("misma reserva (CA2)", () => {
  it("lista las otras habitaciones de la misma reserva", () => {
    const grupos = agruparPorHabitacion(
      [
        persona({ habitacion: "412", reservaId: 7 }),
        persona({ habitacion: "410", reservaId: 7 }),
        persona({ habitacion: "300", reservaId: 8 }),
        persona({ habitacion: "500", reservaId: 7 }),
      ],
      HOY,
    );
    const de = (n) => grupos.find((g) => g.numero === n).mismaReserva;
    expect(de("300")).toEqual([]);
    expect(de("412")).toEqual(["410", "500"]);
    expect(textoMismaReserva(["410"])).toBe("misma reserva que 410");
    expect(textoMismaReserva(["410", "412"])).toBe("misma reserva que 410 y 412");
    expect(textoMismaReserva(["410", "411", "412"])).toBe("misma reserva que 410, 411 y 412");
    expect(textoMismaReserva([])).toBe("");
  });
});

describe("línea de documento (CA3, CA6)", () => {
  it("documento enmascarado y país con nombre completo", () => {
    expect(lineaDocumento(persona())).toBe("DNI •••• 4127 · Argentina");
  });
  it("país sin catálogo se muestra tal cual y sin país no queda un '·' suelto", () => {
    expect(lineaDocumento(persona({ paisDocumento: "Atlantis" }))).toBe("DNI •••• 4127 · Atlantis");
    expect(lineaDocumento(persona({ paisDocumento: null }))).toBe("DNI •••• 4127");
    expect(lineaDocumento(persona({ tipoDocumento: null, paisDocumento: "" }))).toBe("•••• 4127");
  });
  it("menor sin documento: a cargo del responsable de la lista", () => {
    const resp = persona({ nombre: "Laura", apellido: "Lindero" });
    const menor = persona({ tipoDocumento: null, numeroDocumento: null, paisDocumento: null, responsableId: resp.id });
    expect(lineaDocumento(menor, new Map([[resp.id, resp]]))).toBe("Sin documento · a cargo de Laura Lindero");
  });
  it("sin documento y sin responsable en la lista: usa el motivo, o nada", () => {
    const sinResp = persona({ numeroDocumento: null, tipoDocumento: null, responsableId: 999, motivoSinDocumento: "Menor sin DNI" });
    expect(lineaDocumento(sinResp, new Map())).toBe("Sin documento · Menor sin DNI");
    expect(lineaDocumento(persona({ numeroDocumento: null, motivoSinDocumento: null }))).toBe("Sin documento");
    expect(lineaDocumento(persona({ numeroDocumento: null, motivoSinDocumento: "  " }))).toBe("Sin documento");
  });
});

describe("indicadores y pestañas (CA4)", () => {
  const lista = () => [
    persona({ habitacion: "101", reservaId: 1, fechaHasta: "2026-10-08T00:00:00.000Z", esTitular: true }),
    persona({ habitacion: "101", reservaId: 1, fechaHasta: "2026-10-08T00:00:00.000Z", fechaNacimiento: "2018-01-01T00:00:00.000Z" }),
    persona({ habitacion: "102", reservaId: 1, fechaHasta: "2026-10-07T00:00:00.000Z" }),
    persona({ habitacion: "103", reservaId: 2, fechaHasta: "2026-10-12T00:00:00.000Z" }),
    persona({ habitacion: null, reservaId: 3, fechaHasta: "2026-10-07T00:00:00.000Z" }),
  ];
  it("calcula habitaciones, reservas, adultos y menores", () => {
    const ind = calcularIndicadores(lista(), HOY);
    expect(ind).toMatchObject({ habitaciones: 3, reservas: 3, huespedes: 5, adultos: 4, menores: 1 });
    expect(ind.salenHoy).toEqual({ habitaciones: 1, huespedes: 2 });
    expect(ind.vencidas).toEqual({ habitaciones: 1, huespedes: 1 });
  });
  it("los indicadores coinciden con las pestañas", () => {
    const grupos = agruparPorHabitacion(lista(), HOY);
    const ind = calcularIndicadores(lista(), HOY);
    expect(filtrarPorVista(grupos, VISTAS.HOY)).toHaveLength(ind.salenHoy.habitaciones);
    expect(filtrarPorVista(grupos, VISTAS.VENCIDAS)).toHaveLength(ind.vencidas.habitaciones);
    expect(filtrarPorVista(grupos, VISTAS.TODAS)).toHaveLength(4);
  });
});
