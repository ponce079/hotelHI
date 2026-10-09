// GET /api/reservas: sin pagina/limite devuelve el arreglo completo de siempre; con alguno de los dos, una página.
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockGroupBy = jest.fn();
jest.mock("../../lib/prisma", () => ({ reserva: { findMany: (...a) => mockFindMany(...a), count: (...a) => mockCount(...a), groupBy: (...a) => mockGroupBy(...a) } }));
const { listarReservas } = require("./reservas.servicio");

beforeEach(() => {
  mockFindMany.mockReset().mockResolvedValue([]);
  mockCount.mockReset().mockResolvedValue(120);
  mockGroupBy.mockReset().mockResolvedValue([{ estado: "Confirmada", _count: { _all: 70 } }, { estado: "Cerrada", _count: { _all: 50 } }]);
});

test("sin pagina ni limite: el arreglo completo, ordenado como siempre, sin count ni groupBy", async () => {
  const r = await listarReservas({ estado: "Confirmada" });
  expect(Array.isArray(r)).toBe(true);
  expect(mockFindMany.mock.calls[0][0]).not.toHaveProperty("take");
  expect(mockCount).not.toHaveBeenCalled();
  expect(mockGroupBy).not.toHaveBeenCalled();
});

test("con pagina: 50 por defecto, mismos filtros en la página y en el total, y conteo por estado de todas", async () => {
  const r = await listarReservas({ estado: "Confirmada", q: "Pérez", pagina: "3" });
  const consulta = mockFindMany.mock.calls[0][0];
  expect(consulta).toMatchObject({ skip: 100, take: 50, orderBy: [{ id: "desc" }] });
  expect(mockCount.mock.calls[0][0].where).toEqual(consulta.where);
  expect(consulta.where.estado).toBe("Confirmada");
  expect(r).toMatchObject({ total: 120, pagina: 3, limite: 50, paginas: 3, conteoPorEstado: { Confirmada: 70, Cerrada: 50 } });
});

test("el límite se acota (1 a 200) y una página inválida vuelve a la 1", async () => {
  await listarReservas({ limite: "9999", pagina: "-4" });
  expect(mockFindMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 200 });
  mockFindMany.mockClear();
  await listarReservas({ limite: "abc" });
  expect(mockFindMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 50 });
});

test("estado admite varios valores separados por coma; uno solo se comporta como siempre", async () => {
  await listarReservas({ estado: "Confirmada" });
  expect(mockFindMany.mock.calls[0][0].where.estado).toBe("Confirmada");
  mockFindMany.mockClear();
  await listarReservas({ estado: "Confirmada, En curso ,Cerrada", pagina: "1" });
  const consulta = mockFindMany.mock.calls[0][0];
  expect(consulta.where.estado).toEqual({ in: ["Confirmada", "En curso", "Cerrada"] });
  expect(mockCount.mock.calls[0][0].where).toEqual(consulta.where);
  expect(consulta.orderBy).toEqual([{ id: "desc" }]);
  // El conteo por estado sigue siendo histórico y sin filtros.
  expect(mockGroupBy.mock.calls[0][0]).toEqual({ by: ["estado"], _count: { _all: true } });
});

test("un estado desconocido (solo o dentro de la lista) devuelve 400 y no consulta", async () => {
  for (const estado of ["Foo", "Confirmada,Foo"]) {
    await expect(listarReservas({ estado })).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(mockFindMany).not.toHaveBeenCalled();
});
