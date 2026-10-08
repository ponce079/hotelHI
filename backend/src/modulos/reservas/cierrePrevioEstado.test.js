// La vista previa del cierre (cancelar / no-show) sobre una reserva que ya no está Confirmada responde 400 con el
// motivo, nunca 500 (la clase de error del cierre por penalidad se traduce igual que la de garantías).
const mockPrevisualizar = jest.fn();
jest.mock("../../lib/prisma", () => ({}));
jest.mock("../garantias/cierreReserva.servicio", () => {
  class ErrorDeNegocio extends Error {
    constructor(mensaje, statusCode = 400) {
      super(mensaje);
      this.statusCode = statusCode;
    }
  }
  return { previsualizarCierre: (...a) => mockPrevisualizar(...a), cerrarReservaConPenalidad: jest.fn(), ErrorDeNegocio };
});
const cierre = require("../garantias/cierreReserva.servicio");
const { previsualizarCierreReserva, ErrorDeNegocio } = require("./reservas.servicio");

test("Cancelada / No-show / En curso / Cerrada: 400 con el motivo del cálculo de penalidad", async () => {
  mockPrevisualizar.mockRejectedValue(new cierre.ErrorDeNegocio('La penalidad solo se calcula para reservas confirmadas; esta reserva está "Cancelada".', 400));
  const error = await previsualizarCierreReserva(5, "CANCELACION").catch((e) => e);
  expect(error).toBeInstanceOf(ErrorDeNegocio);
  expect(error.statusCode).toBe(400);
  expect(error.message).toMatch(/solo se calcula para reservas confirmadas/);
});

test("el 409 de 'cambió de estado' también llega como 409", async () => {
  mockPrevisualizar.mockRejectedValue(new cierre.ErrorDeNegocio("La reserva cambió de estado.", 409));
  await expect(previsualizarCierreReserva(5, "NO_SHOW")).rejects.toMatchObject({ statusCode: 409 });
});
