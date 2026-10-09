// HU-118: la llegada atrasada (la de ayer) se puede ingresar. validarReservaVigente solo bloquea fechas futuras:
// esta prueba lo fija para que el listado de "Atrasadas" no prometa algo que el check-in rechace.
jest.mock("../../lib/prisma", () => ({}));
jest.mock("../reservas/reservas.servicio", () => ({ ErrorDeNegocio: class extends Error {} }));
jest.mock("../garantias/garantiaEstadia.servicio", () => ({ ErrorDeNegocio: class extends Error {} }));
const { validarReservaVigente } = require("./checkIn.servicio");

const reserva = (desde, estado = "Confirmada") => ({ estado, fechaDesde: new Date(`${desde}T00:00:00.000Z`) });

beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-10-09T03:30:00.000Z"))); // 00:30 del 9 en Argentina
afterEach(() => jest.useRealTimers());

test("la reserva Confirmada con llegada ayer se puede ingresar (a las 00:30 de Argentina)", () => {
  expect(() => validarReservaVigente(reserva("2026-10-08"))).not.toThrow();
});

test("la de hoy también; la de mañana todavía no", () => {
  expect(() => validarReservaVigente(reserva("2026-10-09"))).not.toThrow();
  expect(() => validarReservaVigente(reserva("2026-10-10"))).toThrow(/habilita a partir del/);
});

test("una reserva que ya no está Confirmada no se ingresa", () => {
  expect(() => validarReservaVigente(reserva("2026-10-08", "No-show"))).toThrow(/no-show/);
  expect(() => validarReservaVigente(reserva("2026-10-08", "En curso"))).toThrow(/ya tiene el check-in/);
});
