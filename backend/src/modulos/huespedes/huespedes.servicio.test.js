jest.mock("../../lib/prisma", () => ({
  huesped: { findUnique: jest.fn(), findMany: jest.fn() },
  ocupanteReserva: { findFirst: jest.fn(), count: jest.fn() },
}));
const prisma = require("../../lib/prisma");
const { buscarPorDocumento } = require("./huespedes.servicio");

beforeEach(() => jest.clearAllMocks());

test("no encuentra la persona: 404 y, si el mismo número existe con otro tipo o país, avisa con las iniciales (no fusiona)", async () => {
  prisma.huesped.findUnique.mockResolvedValue(null);
  prisma.huesped.findMany.mockResolvedValue([{ tipoDocumento: "Pasaporte", paisDocumento: "BR", nombres: "María José", apellido: "González", nombre: "María José González" }]);
  const error = await buscarPorDocumento({ tipo: "DNI", pais: "AR", numero: "30.111.222" }).catch((e) => e);
  expect(error.statusCode).toBe(404);
  expect(error.message).toBe("No hay ningún huésped registrado con ese documento.");
  expect(error.extra).toEqual({ otrosDocumentos: [{ tipoDocumento: "Pasaporte", paisDocumento: "BR", iniciales: "M. J. G." }] });
  // Solo busca fichas con el MISMO número normalizado y otra identidad.
  expect(prisma.huesped.findMany.mock.calls[0][0].where.numeroDocumento).toBe("30111222");
  expect(JSON.stringify(error.extra)).not.toMatch(/Mar[ií]a José González/);
});

test("sin ninguna ficha parecida, el 404 no trae nada extra", async () => {
  prisma.huesped.findUnique.mockResolvedValue(null);
  prisma.huesped.findMany.mockResolvedValue([]);
  const error = await buscarPorDocumento({ tipo: "DNI", pais: "AR", numero: "30111222" }).catch((e) => e);
  expect(error.statusCode).toBe(404);
  expect(error.extra).toBeUndefined();
});

test("una ficha sin nombres separados usa las iniciales del nombre completo", async () => {
  prisma.huesped.findUnique.mockResolvedValue(null);
  prisma.huesped.findMany.mockResolvedValue([{ tipoDocumento: "DNI", paisDocumento: "UY", nombres: null, apellido: null, nombre: "Luis Pérez" }]);
  const error = await buscarPorDocumento({ tipo: "DNI", pais: "AR", numero: "30111222" }).catch((e) => e);
  expect(error.extra.otrosDocumentos[0].iniciales).toBe("L. P.");
});
