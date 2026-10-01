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
