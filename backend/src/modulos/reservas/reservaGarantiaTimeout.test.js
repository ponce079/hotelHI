// Vencimiento del guardado en el alta con garantía. Mismo contrato que tenía el alta con
// seña (retirada): si la transacción vence, 408 identificable y sin reintento automático;
// cualquier otro error se propaga tal cual, SIN prometer que no se guardó nada.
// Lo propio de la garantía: si había una retención en la tarjeta, se libera.

jest.mock("../../lib/prisma", () => ({
  reservaHabitacion: { findMany: jest.fn() },
  planTarifario: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock("../../lib/correo", () => ({ enviarCorreo: jest.fn() }));
jest.mock("../garantias/pasarela.servicio", () => {
  const real = jest.requireActual("../garantias/pasarela.servicio");
  return { ...real, procesarTarjeta: jest.fn((p) => real.procesarTarjeta(p)) };
});

const prisma = require("../../lib/prisma");
const { procesarTarjeta } = require("../garantias/pasarela.servicio");
const { haceAnios } = require("../../../scripts/_fechasPrueba");
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
    fechaNacimiento: haceAnios(36),
    nombre: "Prueba Local",
    tipoDocumento: "DNI",
    numeroDocumento: "30111222",
    contacto: "prueba@example.test",
  },
  canalConfirmacion: "Email",
  origen: "RECEPCION",
  garantia: {
    tipo: "TARJETA",
    tarjeta: { titular: "Ana Pérez", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "123" },
  },
};
const OPERACIONES = () => procesarTarjeta.mock.calls.map(([p]) => p.operacion);

beforeEach(() => {
  jest.clearAllMocks();
  prisma.reservaHabitacion.findMany.mockResolvedValue([]);
  prisma.planTarifario.findUnique.mockResolvedValue({ id: 1, reembolsable: true });
});

test("la expiración confirmada devuelve 408 identificable y no reintenta automáticamente", async () => {
  prisma.$transaction.mockRejectedValue(
    Object.assign(new Error("A query cannot be executed on an expired transaction."), {
      code: "P2028",
      meta: { operation: "query", timeout: 60000, timeTaken: 60001 },
    })
  );
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controlador.postReservaConGarantia({ body: datos }, res);
  expect(res.status).toHaveBeenCalledWith(408);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ codigo: "RESERVA_TIEMPO_AGOTADO", error: expect.stringContaining("1 minuto") })
  );
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), require("../../lib/constantes").OPCIONES_TRANSACCION);
});

test("NRF: al vencer el guardado se libera la retención de la tarjeta (nunca queda plata trabada)", async () => {
  prisma.planTarifario.findUnique.mockResolvedValue({ id: 1, reembolsable: false });
  prisma.$transaction.mockRejectedValue(
    Object.assign(new Error("A query cannot be executed on an expired transaction."), { code: "P2028", meta: { operation: "query" } })
  );
  await expect(servicio.crearReservaConGarantia(datos)).rejects.toMatchObject({ statusCode: 408, codigo: "RESERVA_TIEMPO_AGOTADO" });
  expect(OPERACIONES()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
});

test.each([
  { code: "P2028", meta: { operation: "commit" }, message: "Transaction commit failed" },
  { code: "P2028", meta: { operation: "query" }, message: "Transaction not found" },
  { code: "P1001", message: "Database unreachable" },
])("no promete reversión para otros errores: $message", async (error) => {
  prisma.$transaction.mockRejectedValue(error);
  await expect(servicio.crearReservaConGarantia(datos)).rejects.toBe(error);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});
