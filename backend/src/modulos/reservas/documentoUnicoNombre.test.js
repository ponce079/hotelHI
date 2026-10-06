jest.mock("../../lib/prisma", () => ({}));
const { normalizarAltaReserva, resolverHuesped } = require("./reservas.servicio");
const { claveDocumento } = require("../estadia/persona.servicio");

const base = {
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "45112902",
  nombre: "Juan Perez",
  nombres: "Juan",
  apellido: "Perez",
  contacto: "juan@correo.com",
};
const existente = { id: 7, nombre: "Juan Perez", contacto: "juan@correo.com" };
const hacerTx = (huesped) => ({
  huesped: {
    findUnique: jest.fn().mockResolvedValue(huesped),
    create: jest.fn().mockImplementation(async ({ data }) => ({ id: 99, ...data })),
    update: jest.fn().mockImplementation(async ({ where, data }) => ({ id: where.id, ...data })),
  },
});

test("la clave del documento es la misma con o sin puntos", () => {
  expect(claveDocumento({ ...base, numeroDocumento: "45.112.902" })).toBe(claveDocumento(base));
});

test("documento nuevo: crea la ficha", async () => {
  const tx = hacerTx(null);
  const r = await resolverHuesped(tx, { ...base });
  expect(tx.huesped.create).toHaveBeenCalled();
  expect(r.id).toBe(99);
});

test("mismo documento y mismo nombre: reutiliza la ficha", async () => {
  const tx = hacerTx(existente);
  const r = await resolverHuesped(tx, { ...base, nombre: "juan  PEREZ" });
  expect(r.id).toBe(7);
  expect(tx.huesped.create).not.toHaveBeenCalled();
  const data = tx.huesped.update.mock.calls[0][0].data;
  expect(data.nombre).toBeUndefined();
});

test("mismo documento con otro nombre: 409 NOMBRE_DISTINTO y no se modifica nada", async () => {
  const tx = hacerTx(existente);
  await expect(resolverHuesped(tx, { ...base, nombre: "Pedro Gomez", corregirNombre: false })).rejects.toMatchObject({
    statusCode: 409,
    codigo: "NOMBRE_DISTINTO",
  });
  expect(tx.huesped.update).not.toHaveBeenCalled();
  expect(tx.huesped.create).not.toHaveBeenCalled();
});

test("con permiso de corrección (administrador) el nombre se actualiza", async () => {
  const tx = hacerTx(existente);
  await resolverHuesped(tx, { ...base, nombre: "Juan Pablo Perez", nombres: "Juan Pablo", corregirNombre: true });
  const data = tx.huesped.update.mock.calls[0][0].data;
  expect(data).toMatchObject({ nombre: "Juan Pablo Perez", nombres: "Juan Pablo", apellido: "Perez" });
  expect(data.corregirNombre).toBeUndefined();
});

test("el alta normaliza el número de documento y nunca confía en corregirNombre del cliente", () => {
  const alta = normalizarAltaReserva({
    fechaDesde: "2099-01-10",
    fechaHasta: "2099-01-12",
    planTarifarioId: 1,
    totalEsperado: 0,
    habitaciones: [{ habitacionId: 1, adultos: 1, menores: 0 }],
    huesped: { ...base, numeroDocumento: "45.112.902", fechaNacimiento: "1990-05-05", corregirNombre: "true" },
  });
  expect(alta.huesped.numeroDocumento).toBe("45112902");
  expect(alta.huesped.corregirNombre).toBe(false);
});
