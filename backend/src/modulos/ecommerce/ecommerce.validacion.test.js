jest.mock("../../lib/prisma", () => ({}));
const { hoyComoFechaUTC } = require("../../lib/fechas");
const { validarBusqueda, validarCotizacion } = require("./ecommerce.validacion");

// Fechas relativas a hoy (hora argentina), como el resto de los tests.
function dia(desplazamiento) {
  const fecha = hoyComoFechaUTC();
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
}

function errorDe(fn) {
  try {
    fn();
  } catch (err) {
    return { status: err.status, codigo: err.codigo, campo: err.extra?.campo };
  }
  throw new Error("No tiró error");
}

const busqueda = (extra = {}) => ({ fechaDesde: dia(7), fechaHasta: dia(9), adultos: "2", menores: "0", ...extra });

describe("validarBusqueda", () => {
  test("parámetros válidos (los de la query llegan como texto)", () => {
    expect(validarBusqueda(busqueda())).toMatchObject({ adultos: 2, menores: 0, noches: 2 });
  });

  test("entrar hoy está permitido; menores es opcional", () => {
    expect(validarBusqueda(busqueda({ fechaDesde: dia(0), fechaHasta: dia(1), menores: undefined }))).toMatchObject({
      noches: 1,
      menores: 0,
    });
  });

  test.each([
    ["entrada anterior a hoy", { fechaDesde: dia(-1), fechaHasta: dia(2) }, "fechaDesde"],
    ["fecha inexistente", { fechaDesde: "2026-02-31" }, "fechaDesde"],
    ["sin fecha de salida", { fechaHasta: undefined }, "fechaHasta"],
    ["salida igual a la entrada", { fechaHasta: dia(7) }, "fechaHasta"],
    ["más de 30 noches", { fechaHasta: dia(38) }, "fechaHasta"],
    ["sin adultos", { adultos: "0" }, "adultos"],
    ["adultos no entero", { adultos: "1.5" }, "adultos"],
    ["menores negativos", { menores: "-1" }, "menores"],
  ])("%s → 400 DATOS_INVALIDOS con campo", (_caso, extra, campo) => {
    expect(errorDe(() => validarBusqueda(busqueda(extra)))).toEqual({ status: 400, codigo: "DATOS_INVALIDOS", campo });
  });

  test("30 noches justas se aceptan", () => {
    expect(validarBusqueda(busqueda({ fechaHasta: dia(37) })).noches).toBe(30);
  });
});

describe("validarCotizacion", () => {
  const cuerpo = (extra = {}) => ({
    fechaDesde: dia(7),
    fechaHasta: dia(9),
    planTarifarioId: 1,
    habitaciones: [{ tipoHabitacionId: 1, adultos: 2, menores: 0 }],
    ...extra,
  });

  test("cuerpo válido", () => {
    expect(validarCotizacion(cuerpo())).toMatchObject({
      planTarifarioId: 1,
      habitaciones: [{ tipoHabitacionId: 1, adultos: 2, menores: 0 }],
    });
  });

  test.each([
    ["sin plan", { planTarifarioId: undefined }, "planTarifarioId"],
    ["sin habitaciones", { habitaciones: [] }, "habitaciones"],
    ["más de 3 habitaciones", { habitaciones: Array(4).fill({ tipoHabitacionId: 1, adultos: 1 }) }, "habitaciones"],
    ["línea sin tipo", { habitaciones: [{ adultos: 2 }] }, "habitaciones[0].tipoHabitacionId"],
    ["línea sin adultos", { habitaciones: [{ tipoHabitacionId: 1, adultos: 0 }] }, "habitaciones[0].adultos"],
  ])("%s → 400 DATOS_INVALIDOS con campo", (_caso, extra, campo) => {
    expect(errorDe(() => validarCotizacion(cuerpo(extra)))).toEqual({ status: 400, codigo: "DATOS_INVALIDOS", campo });
  });

  test("sin body", () => {
    expect(errorDe(() => validarCotizacion(undefined)).campo).toBe("fechaDesde");
  });
});
