jest.mock("../../lib/prisma", () => ({}));
const { guardar } = require("./estadia.servicio");
const reserva = {
  id: 1,
  estado: "Confirmada",
  fechaDesde: new Date("2026-10-01"),
  fechaHasta: new Date("2026-10-03"),
  reservaHabitaciones: [{ habitacionId: 10, habitacion: { capacidad: 2, numero: "101" } }],
};
const persona = {
  id: 5,
  estado: "Previsto",
  asignaciones: [{ id: 7, habitacionId: 10, hasta: null }],
};
const datos = {
  nombre: "Ana",
  apellido: "Prueba",
  habitacionId: 10,
  operador: "Prueba",
  email: " ANA@gmail.com ",
};
function cliente(correos = []) {
  return {
    huesped: { create: jest.fn().mockResolvedValue({ id: 8 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    reserva: { findUnique: jest.fn().mockResolvedValue(reserva) },
    ocupanteReserva: {
      findFirst: jest.fn().mockResolvedValue(persona),
      findMany: jest.fn().mockImplementation((q) => Promise.resolve(q.select?.email ? correos : [])),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(persona),
      update: jest.fn().mockResolvedValue(persona),
      findUnique: jest.fn().mockResolvedValue(persona),
    },
    asignacionOcupanteHabitacion: { create: jest.fn() },
    eventoEstadia: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}
test("rechaza el correo repetido ignorando mayúsculas y espacios sin escribir el ocupante", async () => {
  const tx = cliente([{ email: "ana@GMAIL.com " }]);
  await expect(guardar(1, null, datos, tx)).rejects.toMatchObject({
    statusCode: 409,
    campos: { email: expect.stringContaining("otro ocupante") },
  });
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.ocupanteReserva.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        reservaId: 1,
        estado: { not: "Cancelado" },
      }),
    }),
  );
  expect(tx.ocupanteReserva.create).not.toHaveBeenCalled();
  expect(tx.eventoEstadia.create).not.toHaveBeenCalled();
});
test("editar el propio ocupante excluye su correo de la búsqueda", async () => {
  const tx = cliente();
  await guardar(1, 5, datos, tx);
  expect(tx.ocupanteReserva.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      select: { id: true, email: true, responsableId: true },
      where: expect.objectContaining({ id: { not: 5 } }),
    }),
  );
  expect(tx.ocupanteReserva.update).toHaveBeenCalled();
});
test("correo opcional y formato inválido diferenciado", async () => {
  const tx = cliente();
  await expect(guardar(1, null, { ...datos, email: "mal@" }, tx)).rejects.toMatchObject({
    statusCode: 400,
    campos: { email: expect.any(String) },
  });
  await guardar(1, null, { ...datos, email: "" }, tx);
  expect(tx.ocupanteReserva.findMany.mock.calls.every(([q]) => !q.select?.email)).toBe(true);
  expect(tx.ocupanteReserva.create).toHaveBeenCalled();
});
