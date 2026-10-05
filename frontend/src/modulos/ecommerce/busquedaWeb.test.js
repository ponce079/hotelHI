import { describe, expect, it } from "vitest";
import {
  ahorroContraFlexible,
  busquedaComoQueryWeb,
  capacidadMaximaDeTipos,
  leerBusquedaDeUrl,
  motivoMasRelevante,
  ordenarTipos,
  textoNoShow,
  textoResumenBusqueda,
} from "./busquedaWeb";

const HOY = "2026-10-04";
const params = (texto) => new URLSearchParams(texto);

describe("leerBusquedaDeUrl", () => {
  it("lee ?entrada&salida&adultos&menores y la valida", () => {
    expect(leerBusquedaDeUrl(params("entrada=2026-10-16&salida=2026-10-18&adultos=2&menores=1"), { hoy: HOY, capacidadMaxima: 4 })).toEqual({
      busqueda: { fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 1 },
      valida: true,
      errores: {},
    });
  });

  it("acepta los nombres de la etapa 1 (?desde&hasta) para no romper links viejos", () => {
    expect(leerBusquedaDeUrl(params("desde=2026-10-16&hasta=2026-10-18&adultos=2"), { hoy: HOY }).valida).toBe(true);
  });

  it("sin fechas en la URL → no hay búsqueda", () => {
    expect(leerBusquedaDeUrl(params(""), { hoy: HOY })).toEqual({ busqueda: null, valida: false, errores: {} });
  });

  it.each([
    ["entrada anterior a hoy", "entrada=2026-10-01&salida=2026-10-03", "fechaDesde"],
    ["salida igual a la entrada", "entrada=2026-10-16&salida=2026-10-16", "fechaHasta"],
    ["más de 30 noches", "entrada=2026-10-16&salida=2026-11-16", "fechaHasta"],
    ["fuera de la ventana de 365 días", "entrada=2027-10-10&salida=2027-10-12", "fechaDesde"],
    ["fecha con otro formato", "entrada=16/10/2026&salida=2026-10-18", "fechaDesde"],
    ["adultos no numérico", "entrada=2026-10-16&salida=2026-10-18&adultos=dos", "adultos"],
    ["más personas que la capacidad", "entrada=2026-10-16&salida=2026-10-18&adultos=3&menores=2", "menores"],
  ])("%s → inválida, con el campo marcado", (_caso, query, campo) => {
    const r = leerBusquedaDeUrl(params(query), { hoy: HOY, capacidadMaxima: 4 });
    expect(r.valida).toBe(false);
    expect(r.errores[campo]).toBeTruthy();
  });

  it("la búsqueda leída vuelve normalizada para precargar el buscador", () => {
    const r = leerBusquedaDeUrl(params("entrada=2026-10-16&salida=2026-10-18&adultos=dos&menores=-1"), { hoy: HOY });
    expect(r.busqueda).toEqual({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 });
  });
});

describe("busquedaComoQueryWeb", () => {
  it("usa los nombres de la etapa 2", () => {
    expect(busquedaComoQueryWeb({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 })).toBe(
      "entrada=2026-10-16&salida=2026-10-18&adultos=2&menores=0"
    );
  });
});

const plan = (codigo, total, reembolsable) => ({ planTarifarioId: codigo === "BAR" ? 1 : 2, codigo, reembolsable, total, promedioPorNoche: total / 2 });
const tipo = (id, nombre, desdePorNoche, motivo = null) => ({
  tipoHabitacionId: id,
  nombre,
  desdePorNoche: motivo ? null : desdePorNoche,
  planes: motivo ? [] : [plan("BAR", desdePorNoche * 2.4, true), plan("NRF", desdePorNoche * 2, false)],
  motivoNoDisponible: motivo,
});

describe("ordenarTipos", () => {
  it("disponibles primero por desdePorNoche; no disponibles al final", () => {
    const orden = ordenarTipos([
      tipo(1, "Suite", null, "Sin disponibilidad para estas fechas"),
      tipo(2, "Doble", 21250),
      tipo(3, "Simple", 17000),
    ]).map((t) => t.nombre);
    expect(orden).toEqual(["Simple", "Doble", "Suite"]);
  });
});

describe("ahorroContraFlexible", () => {
  const planes = [plan("BAR", 50000, true), plan("NRF", 42500, false)];
  it("diferencia real de totales contra la tarifa flexible del mismo tipo", () => {
    expect(ahorroContraFlexible(planes, planes[1])).toBe(7500);
  });
  it("no aplica al plan flexible, sin flexible para comparar ni sin ahorro", () => {
    expect(ahorroContraFlexible(planes, planes[0])).toBeNull();
    expect(ahorroContraFlexible([planes[1]], planes[1])).toBeNull();
    expect(ahorroContraFlexible([plan("BAR", 40000, true), plan("NRF", 42500, false)], plan("NRF", 42500, false))).toBeNull();
  });
});

describe("motivoMasRelevante", () => {
  it("prefiere 'sin disponibilidad' sobre la capacidad", () => {
    expect(
      motivoMasRelevante([tipo(1, "Simple", 0, "Admite hasta 2 personas"), tipo(2, "Doble", 0, "Sin disponibilidad para estas fechas")])
    ).toBe("Sin disponibilidad para estas fechas");
    expect(motivoMasRelevante([tipo(1, "Simple", 0, "Admite hasta 2 personas")])).toBe("Admite hasta 2 personas");
    expect(motivoMasRelevante([])).toBeNull();
  });
});

describe("textos", () => {
  it("resumen sin los ceros", () => {
    expect(textoResumenBusqueda({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 })).toBe("2 noches · 2 adultos");
    expect(textoResumenBusqueda({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-17", adultos: 1, menores: 1 })).toBe("1 noche · 1 adulto · 1 menor");
  });
  it("capacidad máxima entre los tipos de /api/web/tipos (sin números fijos)", () => {
    expect(capacidadMaximaDeTipos([{ capacidadMaxima: 2 }, { capacidadMaxima: 3 }])).toBe(3);
    expect(capacidadMaximaDeTipos(undefined)).toBeUndefined();
  });
  it("no-show según el plan", () => {
    expect(textoNoShow("PRIMERA_NOCHE")).toMatch(/primera noche/);
    expect(textoNoShow("TOTAL_ESTADIA")).toMatch(/total de la estadía/);
  });
});
