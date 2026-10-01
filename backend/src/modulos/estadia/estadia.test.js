jest.mock("../../lib/prisma", () => ({}));
const { normalizarPersona, validarCompleto } = require("./estadia.servicio");
const base = {
  estado: "Alojado",
  fechaDesde: new Date("2026-09-20T00:00:00Z"),
  fechaHasta: new Date("2026-09-24T00:00:00Z"),
  asignaciones: [
    {
      habitacionId: 1,
      desde: new Date("2026-09-19T15:00:00Z"),
      hasta: new Date("2026-09-22T15:00:00Z"),
    },
    { habitacionId: 2, desde: new Date("2026-09-22T15:00:00Z"), hasta: null },
  ],
};
test("rechaza fechas inexistentes y períodos fuera de la reserva", () => {
  expect(() =>
    normalizarPersona(
      {
        nombre: "Ana",
        apellido: "Prueba",
        fechaDesde: "2026-02-30",
        fechaHasta: "2026-09-21",
      },
      base,
    ),
  ).toThrow(/fecha inválida/);
  expect(() =>
    normalizarPersona(
      {
        nombre: "Ana",
        apellido: "Prueba",
        fechaDesde: "2026-09-19",
        fechaHasta: "2026-09-21",
      },
      base,
    ),
  ).toThrow(/dentro de la reserva/);
});
test("un menor con datos completos requiere un adulto responsable", () => {
  expect(() =>
    validarCompleto({
      ...base,
      nombre: "Ana",
      apellido: "Prueba",
      fechaNacimiento: new Date("2015-01-01"),
      nacionalidad: "AR",
      paisResidencia: "AR",
      tipoDocumento: "DNI",
      numeroDocumento: "1",
      paisDocumento: "AR",
    }),
  ).toThrow(/adulto responsable/);
});

test("la residencia sale de la ficha de Huesped, con los mismos nombres hacia la API", () => {
  const { conResidencia } = require("./estadia.servicio");
  const persona = conResidencia({
    id: 1,
    huespedId: 5,
    huesped: { id: 5, nacionalidad: "AR", paisResidencia: "UY", domicilio: "Calle 1", localidad: "Salto" },
  });
  expect(persona).toMatchObject({ nacionalidad: "AR", paisResidencia: "UY", domicilio: "Calle 1", localidad: "Salto" });
  expect(persona).not.toHaveProperty("huesped");
});

test("validarCompleto exige nacionalidad y residencia desde la ficha de Huesped", () => {
  const completo = {
    ...base,
    nombre: "Ana",
    apellido: "Prueba",
    fechaNacimiento: new Date("1990-01-01"),
    tipoDocumento: "DNI",
    numeroDocumento: "1",
    paisDocumento: "AR",
  };
  expect(() => validarCompleto({ ...completo, huesped: { nacionalidad: "AR" } })).toThrow(/nacionalidad y país de residencia/);
  expect(() => validarCompleto({ ...completo, huesped: { nacionalidad: "AR", paisResidencia: "AR" } })).not.toThrow();
});
