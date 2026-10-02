jest.mock("../../lib/prisma", () => ({}));
jest.mock("./checkIn.servicio", () => ({
  confirmarCheckInConReserva: jest.fn(),
  ErrorDeNegocio: class extends Error {},
}));
const servicio = require("./checkIn.servicio");
const { ErrorDeNegocio } = require("../estadia/estadia.servicio");
const { postConfirmarConReserva } = require("./checkIn.controlador");

test("la advertencia de estadía llega al cliente como 409 con código y cotización", async () => {
  const error = new ErrorDeNegocio("Confirmá la ampliación.", 409);
  error.codigo = "AMPLIACION_OCUPACION_REQUIERE_CONFIRMACION";
  error.detalle = { totalAnterior: 200, totalNuevo: 220, diferencia: 20, token: "vigente" };
  servicio.confirmarCheckInConReserva.mockRejectedValue(error);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await postConfirmarConReserva({ params: { reservaId: "1" }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: error.message, codigo: error.codigo, detalle: error.detalle });
});
