const { hoyComoFechaUTC } = require("./fechas");

// "Hoy" es el día en hora argentina (UTC-3), no el día UTC ni el del proceso: entre las 00:00 y
// las 03:00 de Argentina el día UTC ya es el mismo, y entre las 21:00 y las 24:00 ya es el siguiente.
describe("hoyComoFechaUTC", () => {
  afterEach(() => jest.useRealTimers());
  const hoyA = (instante) => {
    jest.useFakeTimers({ now: new Date(instante) });
    return hoyComoFechaUTC().toISOString().slice(0, 10);
  };

  it("a las 02:43 del 03/10 en Argentina es el 03/10", () => {
    expect(hoyA("2026-10-03T05:43:00Z")).toBe("2026-10-03");
  });
  it("a las 00:05 del 03/10 en Argentina es el 03/10", () => {
    expect(hoyA("2026-10-03T03:05:00Z")).toBe("2026-10-03");
  });
  it("a las 23:59 del 02/10 en Argentina sigue siendo el 02/10 (en UTC ya es 03/10)", () => {
    expect(hoyA("2026-10-03T02:59:00Z")).toBe("2026-10-02");
  });
});
