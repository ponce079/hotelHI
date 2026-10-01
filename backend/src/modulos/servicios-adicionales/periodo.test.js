jest.mock("../../lib/prisma", () => ({ consumoServicioAdicional: { findMany: jest.fn().mockResolvedValue([]) } }));
const prisma = require("../../lib/prisma");
const { listarConsumosHotel } = require("./serviciosAdicionales.servicio");
test("el día argentino incluye los cargos de las 23 horas y excluye la medianoche siguiente", async () => {
  await listarConsumosHotel({ desde: "2026-09-30", hasta: "2026-09-30" });
  const { gte, lt } = prisma.consumoServicioAdicional.findMany.mock.calls.at(-1)[0].where.fechaHora;
  expect(gte.toISOString()).toBe("2026-09-30T03:00:00.000Z");
  expect(lt.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  expect(new Date("2026-10-01T02:27:39.717Z") < lt).toBe(true);
});
test.each([{ desde: "2026-02-30" }, { desde: "2026-10-02", hasta: "2026-10-01" }])(
  "rechaza un período inválido %j",
  async (filtros) => {
    await expect(listarConsumosHotel(filtros)).rejects.toMatchObject({ statusCode: 400 });
  },
);
