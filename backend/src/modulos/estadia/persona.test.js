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
