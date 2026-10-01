jest.mock("../../lib/prisma", () => ({}));
const { claveDocumento, vincularPersona } = require("./persona.servicio");

test("la identidad incluye país y tipo, y normaliza nombres del catálogo", () => {
  const persona = {
    tipoDocumento: "Pasaporte",
    paisDocumento: "AR",
    numeroDocumento: "ab 123",
  };
  expect(claveDocumento(persona)).toBe(
    claveDocumento({
      ...persona,
      paisDocumento: "Argentina",
      numeroDocumento: "AB123",
    }),
  );
  expect(claveDocumento(persona)).not.toBe(
    claveDocumento({ ...persona, paisDocumento: "BR" }),
  );
  expect(claveDocumento(persona)).not.toBe(
    claveDocumento({ ...persona, tipoDocumento: "DNI" }),
  );
});

test("sin documento crea una ficha vinculable sin inventar un número", async () => {
  const tx = { huesped: { create: jest.fn().mockResolvedValue({ id: 12 }) } };
  expect(
    await vincularPersona(tx, {}, { nombre: "Ana", apellido: "Prueba" }),
  ).toBe(12);
  expect(tx.huesped.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ numeroDocumento: "" }),
    }),
  );
  expect(await vincularPersona(tx, {}, {}, { huespedId: 12 })).toBe(12);
  expect(tx.huesped.create).toHaveBeenCalledTimes(1);
});

test("normalizarPais reconoce cualquier país del catálogo ISO, no solo los limítrofes", () => {
  const { normalizarPais } = require("./persona.servicio");
  expect(normalizarPais("Perú")).toBe("PE");
  expect(normalizarPais("estados unidos")).toBe("US");
  expect(normalizarPais("jp")).toBe("JP");
  expect(normalizarPais("Otro país")).toBe("OTROPAIS");
  expect(claveDocumento({ tipoDocumento: "DNI", paisDocumento: "España", numeroDocumento: "1" })).toBe(
    claveDocumento({ tipoDocumento: "DNI", paisDocumento: "ES", numeroDocumento: "1" }),
  );
});

test("actualizarResidencia guarda en Huesped los últimos datos declarados y no borra con vacíos", async () => {
  const { actualizarResidencia } = require("./persona.servicio");
  const tx = { huesped: { update: jest.fn() } };
  await actualizarResidencia(tx, 7, { nacionalidad: "AR", paisResidencia: "UY", domicilio: null, localidad: "" });
  expect(tx.huesped.update).toHaveBeenCalledWith({
    where: { id: 7 },
    data: { nacionalidad: "AR", paisResidencia: "UY" },
  });
  tx.huesped.update.mockClear();
  await actualizarResidencia(tx, 7, { nacionalidad: null });
  expect(tx.huesped.update).not.toHaveBeenCalled();
});

test("actualizarResidenciaEnLote usa una sola sentencia sin importar cuántas fichas haya", async () => {
  const { actualizarResidenciaEnLote } = require("./persona.servicio");
  const tx = { $executeRaw: jest.fn() };
  const filas = Array.from({ length: 25 }, (_, i) => ({ huespedId: i + 1, residencia: { nacionalidad: "AR" } }));
  await actualizarResidenciaEnLote(tx, filas);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  await actualizarResidenciaEnLote(tx, [{ huespedId: 1, residencia: { nacionalidad: null } }]);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
});

test("una ficha con identidad provisoria se completa como una sin identidad", async () => {
  const { esProvisoria, PREFIJO_SIN_DOCUMENTO } = require("./persona.servicio");
  expect(esProvisoria({ identidadDocumento: null })).toBe(true);
  expect(esProvisoria({ identidadDocumento: `${PREFIJO_SIN_DOCUMENTO}abc` })).toBe(true);
  expect(esProvisoria({ identidadDocumento: "a".repeat(64) })).toBe(false);
  const persona = { nombre: "Ana", apellido: "P", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "123" };
  const tx = {
    huesped: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 9, identidadDocumento: `${PREFIJO_SIN_DOCUMENTO}abc` })
        .mockResolvedValueOnce(null),
      update: jest.fn(),
    },
  };
  expect(await vincularPersona(tx, {}, persona, { huespedId: 9 })).toBe(9);
  expect(tx.huesped.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ identidadDocumento: expect.any(String) }) }),
  );
});
