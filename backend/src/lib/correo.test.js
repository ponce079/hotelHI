const { conEsperaMaxima } = require("./correo");

describe("conEsperaMaxima", () => {
  let consola;
  beforeEach(() => {
    jest.useFakeTimers();
    consola = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    consola.mockRestore();
  });

  test("si el envío llega a tiempo devuelve su resultado", async () => {
    await expect(conEsperaMaxima(Promise.resolve({ enviado: true }))).resolves.toEqual({ enviado: true });
  });

  test("si tarda más de 1,5 s devuelve enviado: null y enCamino, y el envío sigue", async () => {
    let terminar;
    const lento = new Promise((r) => (terminar = r));
    const espera = conEsperaMaxima(lento);
    jest.advanceTimersByTime(1500);
    await expect(espera).resolves.toEqual({ enviado: null, enCamino: true });
    terminar({ enviado: true });
  });

  test("un envío que tira queda en el log y no rompe", async () => {
    await expect(conEsperaMaxima(Promise.reject(new Error("caído")), { etiqueta: "x" })).resolves.toEqual({ enviado: false });
    expect(consola).toHaveBeenCalled();
  });

  test("un fallo que llega después del tiempo se registra en el log", async () => {
    let fallar;
    const lento = new Promise((_, rej) => (fallar = rej));
    const espera = conEsperaMaxima(lento, { etiqueta: "tarde" });
    jest.advanceTimersByTime(1500);
    await espera;
    fallar(new Error("rechazado"));
    await Promise.resolve();
    await Promise.resolve();
    expect(consola).toHaveBeenCalledWith(expect.stringContaining("tarde"), "rechazado");
  });
});
