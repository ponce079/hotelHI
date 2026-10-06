const { leerSecreto, LARGO_MINIMO, SECRETO_DE_DESARROLLO, _reiniciarAdvertencia } = require("./pasarelaSecreto");

const SECRETO_VALIDO = "x".repeat(LARGO_MINIMO);

beforeEach(() => _reiniciarAdvertencia());

describe("producción", () => {
  test("sin PASARELA_TOKEN_SECRETO: error claro (el backend no arranca)", () => {
    expect(() => leerSecreto({ NODE_ENV: "production" })).toThrow(/Falta PASARELA_TOKEN_SECRETO/);
    expect(() => leerSecreto({ NODE_ENV: "production", PASARELA_TOKEN_SECRETO: "" })).toThrow(/Falta PASARELA_TOKEN_SECRETO/);
  });

  test("con menos de 32 caracteres: error que dice cuántos tiene", () => {
    expect(() => leerSecreto({ NODE_ENV: "production", PASARELA_TOKEN_SECRETO: "x".repeat(31) })).toThrow(/demasiado corta \(31 caracteres\)/);
  });

  test("con 32 o más caracteres: la usa", () => {
    expect(leerSecreto({ NODE_ENV: "production", PASARELA_TOKEN_SECRETO: SECRETO_VALIDO })).toBe(SECRETO_VALIDO);
  });

  test("nunca cae al valor de desarrollo ni advierte", () => {
    const advertir = jest.fn();
    expect(() => leerSecreto({ NODE_ENV: "production" }, { advertir })).toThrow();
    expect(advertir).not.toHaveBeenCalled();
  });
});

describe("desarrollo y test", () => {
  test("si falta, usa el valor de desarrollo y avisa UNA sola vez, sin imprimir el valor", () => {
    const advertir = jest.fn();
    for (const entorno of [{}, { NODE_ENV: "development" }, { NODE_ENV: "test" }]) {
      expect(leerSecreto(entorno, { advertir })).toBe(SECRETO_DE_DESARROLLO);
    }
    expect(advertir).toHaveBeenCalledTimes(1);
    expect(advertir.mock.calls[0][0]).toMatch(/PASARELA_TOKEN_SECRETO no está definida/);
    expect(advertir.mock.calls[0][0]).not.toContain(SECRETO_DE_DESARROLLO);
  });

  test("si está definida, la usa y no advierte", () => {
    const advertir = jest.fn();
    expect(leerSecreto({ PASARELA_TOKEN_SECRETO: "mi-secreto-local" }, { advertir })).toBe("mi-secreto-local");
    expect(advertir).not.toHaveBeenCalled();
  });

  test("el valor de desarrollo mide menos de lo que exige producción... y no se acepta allá", () => {
    expect(() => leerSecreto({ NODE_ENV: "production", PASARELA_TOKEN_SECRETO: SECRETO_DE_DESARROLLO.slice(0, 31) })).toThrow();
  });
});

describe("firma de tokens", () => {
  test("cambiar el secreto invalida los tokens ya emitidos", () => {
    jest.resetModules();
    process.env.PASARELA_TOKEN_SECRETO = "secreto-numero-uno-de-prueba";
    jest.doMock("../../lib/prisma", () => ({}));
    const uno = require("./pasarela.servicio");
    return uno
      .procesarTarjeta({
        operacion: "GARANTIA",
        monto: 0,
        tarjeta: { titular: "A", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "123" },
      })
      .then((r) => {
        expect(uno.leerToken(r.token)).toMatchObject({ ultimos4: "4242" });
        jest.resetModules();
        process.env.PASARELA_TOKEN_SECRETO = "secreto-numero-dos-de-prueba";
        jest.doMock("../../lib/prisma", () => ({}));
        const dos = require("./pasarela.servicio");
        expect(dos.leerToken(r.token)).toBeNull();
        delete process.env.PASARELA_TOKEN_SECRETO;
      });
  });
});
