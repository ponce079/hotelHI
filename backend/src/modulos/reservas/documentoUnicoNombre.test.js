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
  const r = await resolverHuesped(tx, { ...base, nombre: "juan  PEREZ", contacto: "otro@correo.com" });
  expect(r.id).toBe(7);
  expect(tx.huesped.create).not.toHaveBeenCalled();
  // Sin la casilla "Actualizar la ficha del huésped": no se pisa el contacto (ni nada) de la ficha existente.
  expect(tx.huesped.update).not.toHaveBeenCalled();
});

test("mismo documento y mismo nombre, SIN actualizar la ficha: solo completa los datos que la ficha no tiene", async () => {
  const tx = hacerTx({ ...existente, contacto: null, fechaNacimiento: null, preferencias: null });
  await resolverHuesped(tx, { ...base, contacto: "nuevo@correo.com", fechaNacimiento: new Date("1990-01-01T00:00:00Z"), preferencias: "piso alto" });
  expect(tx.huesped.update).toHaveBeenCalledTimes(1);
  const data = tx.huesped.update.mock.calls[0][0].data;
  expect(data).toEqual({ fechaNacimiento: new Date("1990-01-01T00:00:00Z"), contacto: "nuevo@correo.com", preferencias: "piso alto" });
  expect(data.nombre).toBeUndefined();
});

test("con la casilla 'Actualizar la ficha del huésped con estos datos' sí se actualiza el contacto, y el nombre sigue igual", async () => {
  const tx = hacerTx(existente);
  await resolverHuesped(tx, { ...base, contacto: "otro@correo.com", actualizarFicha: true });
  const data = tx.huesped.update.mock.calls[0][0].data;
  expect(data.contacto).toBe("otro@correo.com");
  expect(data.nombre).toBeUndefined();
  expect(data).not.toHaveProperty("actualizarFicha");
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

describe("ficha creada en paralelo por otra alta (P2002 del índice único)", () => {
  test("se relee la ficha ganadora (lectura actual) y se reutiliza: sin crear otra y sin pisar sus datos", async () => {
    const ganadora = { id: 42, nombre: "Juan Perez", contacto: "ya@guardado.com", fechaNacimiento: null, preferencias: null };
    const tx = {
      huesped: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" })),
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([ganadora]),
    };
    const huesped = await resolverHuesped(tx, { ...base, contacto: "nuevo@correo.com" });
    expect(huesped).toBe(ganadora);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // El contacto que ya tenía no se reemplaza; no hay nada vacío que completar: ninguna escritura.
    expect(tx.huesped.update).not.toHaveBeenCalled();
  });

  test("otro error de la base no se confunde con la carrera: se propaga", async () => {
    const tx = { huesped: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(new Error("caída")) }, $queryRaw: jest.fn() };
    await expect(resolverHuesped(tx, base)).rejects.toThrow("caída");
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  test("la ganadora con OTRO nombre sigue protegida (409 NOMBRE_DISTINTO)", async () => {
    const tx = {
      huesped: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" })) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 9, nombre: "Otra Persona", contacto: "x@y.com" }]),
    };
    await expect(resolverHuesped(tx, base)).rejects.toMatchObject({ codigo: "NOMBRE_DISTINTO", statusCode: 409 });
  });
});
