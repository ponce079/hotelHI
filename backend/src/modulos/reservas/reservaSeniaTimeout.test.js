jest.mock("../../lib/prisma", () => ({ reservaHabitacion: { findMany: jest.fn() }, $transaction: jest.fn() }));
jest.mock("../../lib/correo", () => ({ enviarCorreo: jest.fn() }));
const prisma = require("../../lib/prisma");
const servicio = require("./reservas.servicio");
const controlador = require("./reservas.controlador");
const datos = {
  fechaDesde: "2099-10-10",
  fechaHasta: "2099-10-13",
  habitaciones: [{ habitacionId: 1, adultos: 1, menores: 0 }],
  planTarifarioId: 1,
  totalEsperado: 100000,
  huesped: {
    paisDocumento: "AR",
    fechaNacimiento: "1990-01-01",
    nombre: "Prueba Local",
    tipoDocumento: "DNI",
    numeroDocumento: "30111222",
    contacto: "prueba@example.test",
  },
  canalConfirmacion: "Email",
  origen: "RECEPCION",
  medios: [{ tipo: "Efectivo", importe: 30000 }],
};
beforeEach(() => {
  jest.clearAllMocks();
  prisma.reservaHabitacion.findMany.mockResolvedValue([]);
});
test("la expiración confirmada devuelve 408 identificable y no reintenta automáticamente", async () => {
  prisma.$transaction.mockRejectedValue(
    Object.assign(new Error("A query cannot be executed on an expired transaction."), {
      code: "P2028",
      meta: { operation: "query", timeout: 60000, timeTaken: 60001 },
    }),
  );
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controlador.postReservaConSenia({ body: datos }, res);
  expect(res.status).toHaveBeenCalledWith(408);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ codigo: "RESERVA_TIEMPO_AGOTADO", error: expect.stringContaining("1 minuto") }),
  );
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(prisma.$transaction).toHaveBeenCalledWith(
    expect.any(Function),
    require("../../lib/constantes").OPCIONES_TRANSACCION,
  );
});
test.each([
  { code: "P2028", meta: { operation: "commit" }, message: "Transaction commit failed" },
  { code: "P2028", meta: { operation: "query" }, message: "Transaction not found" },
  { code: "P1001", message: "Database unreachable" },
])("no promete reversión para otros errores: $message", async (error) => {
  prisma.$transaction.mockRejectedValue(error);
  await expect(servicio.crearReservaConSena(datos)).rejects.toBe(error);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});
