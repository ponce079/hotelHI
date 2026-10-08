// Llegadas de hoy: la búsqueda por documento ignora puntos, guiones y espacios (el número se guarda normalizado).
jest.mock("../../lib/prisma", () => ({ reserva: { findMany: jest.fn(), count: jest.fn() } }));
const prisma = require("../../lib/prisma");
const { listarLlegadas } = require("./checkIn.apoyo.servicio");

beforeEach(() => {
  jest.clearAllMocks();
  prisma.reserva.count.mockResolvedValue(0);
  prisma.reserva.findMany.mockResolvedValue([]);
});

const condiciones = () => prisma.reserva.findMany.mock.calls[0][0].where.OR;
const porDocumento = (ors) => ors.filter((c) => c.huesped?.numeroDocumento).map((c) => c.huesped.numeroDocumento.contains);

test("buscar '45.112.902' también busca '45112902' (documento guardado sin puntos)", async () => {
  await listarLlegadas({ q: "45.112.902" });
  expect(porDocumento(condiciones())).toEqual(["45.112.902", "45112902"]);
});

test("buscar '45 112-902' busca el número sin separadores", async () => {
  await listarLlegadas({ q: "45 112-902" });
  expect(porDocumento(condiciones())).toContain("45112902");
});

test("un texto que ya es un número limpio no duplica la condición", async () => {
  await listarLlegadas({ q: "45112902" });
  expect(porDocumento(condiciones())).toEqual(["45112902"]);
});

test("un texto sin letras ni números (solo signos) no agrega una condición vacía", async () => {
  await listarLlegadas({ q: "..." });
  expect(porDocumento(condiciones())).toEqual(["..."]);
});

test("sin búsqueda no hay filtro de texto", async () => {
  await listarLlegadas({});
  expect(prisma.reserva.findMany.mock.calls[0][0].where.OR).toBeUndefined();
});

test("el código de confirmación y el nombre se siguen buscando como siempre", async () => {
  await listarLlegadas({ q: "Pérez" });
  const ors = condiciones();
  expect(ors).toContainEqual({ codigoConfirmacion: { contains: "Pérez" } });
  expect(ors).toContainEqual({ huesped: { nombre: { contains: "Pérez" } } });
});
