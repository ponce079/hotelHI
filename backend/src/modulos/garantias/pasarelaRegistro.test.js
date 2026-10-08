// El registro real (Prisma) con una base falsa: cómo traduce los choques de unicidad y arma la transición atómica.
const { Prisma } = require("@prisma/client");

const tx = { pasarelaOperacion: { updateMany: jest.fn(), create: jest.fn() } };
jest.mock("../../lib/prisma", () => ({
  pasarelaOperacion: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
}));
const prisma = require("../../lib/prisma");
const registro = require("./pasarelaRegistro");

const duplicado = (target) =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7", meta: { target } });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((fn) => fn(tx));
});

test("buscarPorClave y buscarPreautorizacion consultan por clave y por referencia aprobada de una PREAUTORIZACION", async () => {
  prisma.pasarelaOperacion.findUnique.mockResolvedValue({ id: 1 });
  prisma.pasarelaOperacion.findFirst.mockResolvedValue({ id: 2 });
  expect(await registro.buscarPorClave("GARANTIA:k")).toEqual({ id: 1 });
  expect(prisma.pasarelaOperacion.findUnique).toHaveBeenCalledWith({ where: { claveIdempotencia: "GARANTIA:k" } });
  expect(await registro.buscarPreautorizacion("PRE-000001")).toEqual({ id: 2 });
  expect(prisma.pasarelaOperacion.findFirst).toHaveBeenCalledWith({
    where: { referencia: "PRE-000001", operacion: "PREAUTORIZACION", aprobada: true },
  });
});

test("crear: devuelve la fila, o qué índice único chocó (clave o referencia)", async () => {
  prisma.pasarelaOperacion.create.mockResolvedValueOnce({ id: 5 });
  expect(await registro.crear({ operacion: "GARANTIA" })).toEqual({ creada: true, fila: { id: 5 } });

  prisma.pasarelaOperacion.create.mockRejectedValueOnce(duplicado(["claveIdempotencia"]));
  expect(await registro.crear({})).toEqual({ creada: false, duplicado: "clave" });
  prisma.pasarelaOperacion.create.mockRejectedValueOnce(duplicado("pasarela_operaciones_claveIdempotencia_key"));
  expect(await registro.crear({})).toEqual({ creada: false, duplicado: "clave" });
  prisma.pasarelaOperacion.create.mockRejectedValueOnce(duplicado(["referencia"]));
  expect(await registro.crear({})).toEqual({ creada: false, duplicado: "referencia" });

  // Cualquier otro error se propaga (la pasarela lo informa como error, nunca como aprobación).
  prisma.pasarelaOperacion.create.mockRejectedValueOnce(new Error("base caída"));
  await expect(registro.crear({})).rejects.toThrow("base caída");
});

test("transicionarYCrear: mueve el estado SOLO si sigue en 'desde' y escribe la operación en la misma transacción", async () => {
  tx.pasarelaOperacion.updateMany.mockResolvedValue({ count: 1 });
  tx.pasarelaOperacion.create.mockResolvedValue({ id: 9 });
  const r = await registro.transicionarYCrear(
    { referencia: "PRE-000001", desde: "Vigente", hasta: "Capturada", montoCapturado: 18000 },
    { operacion: "CAPTURA" }
  );
  expect(r).toEqual({ creada: true, fila: { id: 9 } });
  expect(tx.pasarelaOperacion.updateMany).toHaveBeenCalledWith({
    where: { referencia: "PRE-000001", operacion: "PREAUTORIZACION", aprobada: true, estadoPreautorizacion: "Vigente" },
    data: { estadoPreautorizacion: "Capturada", montoCapturado: 18000 },
  });
  expect(tx.pasarelaOperacion.create).toHaveBeenCalledWith({ data: { operacion: "CAPTURA" } });
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

test("transicionarYCrear: sin montoCapturado no lo toca (liberaciones)", async () => {
  tx.pasarelaOperacion.updateMany.mockResolvedValue({ count: 1 });
  tx.pasarelaOperacion.create.mockResolvedValue({ id: 9 });
  await registro.transicionarYCrear({ referencia: "PRE-000001", desde: "Vigente", hasta: "Liberada" }, { operacion: "LIBERACION" });
  expect(tx.pasarelaOperacion.updateMany.mock.calls[0][0].data).toEqual({ estadoPreautorizacion: "Liberada" });
});

test("transicionarYCrear: si alguien movió la preautorización antes (count 0), no escribe la operación", async () => {
  tx.pasarelaOperacion.updateMany.mockResolvedValue({ count: 0 });
  const r = await registro.transicionarYCrear({ referencia: "PRE-000001", desde: "Vigente", hasta: "Liberada" }, { operacion: "LIBERACION" });
  expect(r).toEqual({ creada: false, duplicado: "estado" });
  expect(tx.pasarelaOperacion.create).not.toHaveBeenCalled();
});

test("transicionarYCrear: un choque de unicidad dentro de la transacción se informa (y la transacción se revierte sola)", async () => {
  tx.pasarelaOperacion.updateMany.mockResolvedValue({ count: 1 });
  tx.pasarelaOperacion.create.mockRejectedValue(duplicado(["claveIdempotencia"]));
  const r = await registro.transicionarYCrear({ referencia: "PRE-000001", desde: "Vigente", hasta: "Liberada" }, { operacion: "LIBERACION" });
  expect(r).toEqual({ creada: false, duplicado: "clave" });
});
