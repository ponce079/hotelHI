jest.mock("../../lib/prisma", () => ({}));
const { incorporarEnTransaccion } = require("./titular.servicio");
const { validarCompleto } = require("./estadia.servicio");
const huesped = {
  id: 9,
  nombre: "Ana María Pérez",
  tipoDocumento: "DNI",
  numeroDocumento: "12345678",
  contacto: "ana@example.com",
};
const reserva = {
  id: 1,
  fechaDesde: new Date("2026-10-01"),
  fechaHasta: new Date("2026-10-04"),
  reservaHabitaciones: [{ habitacionId: 10, habitacion: { capacidad: 3 } }],
};
function cliente(personas = [], evento = null) {
  return {
    ocupanteReserva: {
      update: jest.fn(async ({ where, data }) => ({
        ...personas.find((p) => p.id === where.id),
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue(personas),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 20, ...data })),
    },
    eventoEstadia: {
      findFirst: jest.fn().mockResolvedValue(evento),
      create: jest.fn(),
    },
  };
}
test("incorpora al titular con datos conocidos y sin inventar apellido, país ni nacimiento", async () => {
  const tx = cliente();
  await expect(
    incorporarEnTransaccion(tx, reserva, huesped, "Recepción", true),
  ).resolves.toMatchObject({ ocupanteId: 20, creado: true });
  expect(tx.ocupanteReserva.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        nombre: "Ana María Pérez",
        apellido: "",
        email: "ana@example.com",
        estado: "Previsto",
        asignaciones: { create: expect.objectContaining({ habitacionId: 10 }) },
      }),
    }),
  );
  const data = tx.ocupanteReserva.create.mock.calls[0][0].data;
  expect(data.paisDocumento).toBeUndefined();
  expect(data.fechaNacimiento).toBeUndefined();
  expect(data.verificadoEn).toBeUndefined();
  expect(() => validarCompleto(data)).toThrow(/nombre y apellido/);
});
test("reutiliza al titular ya cargado sin sobrescribir sus datos ni consumir otra plaza", async () => {
  const p = {
    ...huesped,
    id: 7,
    apellido: "Pérez",
    fechaNacimiento: new Date("1980-01-01"),
  };
  const tx = cliente([p]);
  expect(
    await incorporarEnTransaccion(tx, reserva, huesped, "Recepción"),
  ).toMatchObject({ ocupanteId: 7, creado: false });
  expect(tx.ocupanteReserva.create).not.toHaveBeenCalled();
});
test("la FK evita duplicar al titular aunque se edite su documento", async () => {
  const tx = cliente([{ id: 7, huespedId: 9, esTitular: true }]);
  expect(
    await incorporarEnTransaccion(tx, reserva, huesped, "Prueba"),
  ).toMatchObject({ ocupanteId: 7, incorporado: false });
  expect(tx.ocupanteReserva.create).not.toHaveBeenCalled();
});
const ocupante = (id) => ({
  id,
  estado: "Previsto",
  fechaDesde: reserva.fechaDesde,
  fechaHasta: reserva.fechaHasta,
  asignaciones: [{ habitacionId: 10, hasta: null }],
});
test("titular más dos acompañantes ocupa la tercera plaza; no acepta una cuarta persona", async () => {
  const tx = cliente([ocupante(1), ocupante(2)]);
  await incorporarEnTransaccion(tx, reserva, huesped, "Recepción");
  expect(tx.ocupanteReserva.create).toHaveBeenCalledTimes(1);
  const llena = cliente([ocupante(1), ocupante(2), ocupante(3)]);
  await expect(
    incorporarEnTransaccion(llena, reserva, huesped, "Recepción"),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(llena.ocupanteReserva.create).not.toHaveBeenCalled();
});
test("en reservas grupales usa una habitación con plaza y conserva el correo compartido como aviso", async () => {
  const tx = cliente([{ ...ocupante(1), email: "ANA@example.com" }]);
  const r = {
    ...reserva,
    reservaHabitaciones: [
      { habitacionId: 10, habitacion: { capacidad: 1 } },
      { habitacionId: 11, habitacion: { capacidad: 1 } },
    ],
  };
  const resultado = await incorporarEnTransaccion(tx, r, huesped, "Recepción");
  expect(resultado.aviso).toMatch(/correo/);
  expect(tx.ocupanteReserva.create.mock.calls[0][0].data).toMatchObject({
    email: null,
    asignaciones: { create: { habitacionId: 11 } },
  });
});
