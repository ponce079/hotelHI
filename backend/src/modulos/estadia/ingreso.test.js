jest.mock("../../lib/prisma", () => ({}));
const { validarOcupacion, prepararIngreso } = require("./ingreso");
const adulto = {
  id: 1,
  esTitular: true,
  nombre: "Ana",
  apellido: "Prueba",
  estado: "Previsto",
  fechaDesde: new Date("2020-01-01"),
  fechaHasta: new Date("2099-01-01"),
  fechaNacimiento: new Date("1990-01-01"),
  nacionalidad: "AR",
  paisResidencia: "AR",
  tipoDocumento: "DNI",
  numeroDocumento: "123",
  paisDocumento: "AR",
  verificadoEn: new Date(),
  asignaciones: [{ habitacionId: 1, hasta: null }],
};
const habitaciones = [
  {
    habitacionId: 1,
    adultos: 1,
    menores: 0,
    habitacion: { id: 1, numero: "101", capacidad: 2 },
  },
];
const txPara = (personas) => ({
  reservaHabitacion: { findMany: jest.fn().mockResolvedValue(habitaciones) },
  ocupanteReserva: {
    findMany: jest.fn().mockResolvedValue(personas),
    update: jest.fn(),
  },
  $executeRaw: jest.fn(),
  eventoEstadia: { create: jest.fn() },
});
test("usa la ocupación reservada y no suma otra plaza por el titular", () => {
  expect(() => validarOcupacion(habitaciones, [adulto])).not.toThrow();
});

test("rechaza una habitación sin titular explícito", () => {
  expect(() =>
    validarOcupacion(habitaciones, [{ ...adulto, esTitular: false }]),
  ).toThrow(/exactamente un titular/);
});

test("rechaza dos titulares aunque la cantidad y capacidad sean correctas", () => {
  expect(() =>
    validarOcupacion(
      [{ ...habitaciones[0], adultos: 2 }],
      [adulto, { ...adulto, id: 2 }],
    ),
  ).toThrow(/exactamente un titular/);
});
test.each([[[]], [[adulto, { ...adulto, id: 2 }]]])(
  "rechaza fichas faltantes o sobrantes: %j",
  (personas) => {
    expect(() => validarOcupacion(habitaciones, personas)).toThrow(
      /registradas y 1 reservadas/,
    );
  },
);
test("distingue adultos y menores aunque coincida el total", () => {
  expect(() =>
    validarOcupacion(habitaciones, [
      { ...adulto, fechaNacimiento: new Date("2015-01-01"), responsableId: 2 },
    ]),
  ).toThrow(/adulto/);
});
test("rechaza asignaciones dobles y capacidad excedida", () => {
  expect(() =>
    validarOcupacion(habitaciones, [
      {
        ...adulto,
        asignaciones: [
          ...adulto.asignaciones,
          { habitacionId: 2, hasta: null },
        ],
      },
    ]),
  ).toThrow(/única/);
  expect(() =>
    validarOcupacion([{ ...habitaciones[0], adultos: 3 }], [adulto]),
  ).toThrow(/ocupación reservada/);
});
test.each([
  { verificadoEn: null },
  { nacionalidad: null },
  { fechaDesde: new Date("2099-01-01") },
])("no escribe un ingreso inválido: %j", async (cambio) => {
  const tx = txPara([{ ...adulto, ...cambio }]);
  await expect(prepararIngreso(tx, 1, "Recepción")).rejects.toThrow();
  expect(tx.$executeRaw).not.toHaveBeenCalled();
});
test("ingresa y audita IDs, sin otra declaración de cantidades", async () => {
  const tx = txPara([adulto]);
  await prepararIngreso(tx, 1, "Recepción");
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  expect(tx.ocupanteReserva.update).not.toHaveBeenCalled();
  expect(
    JSON.parse(tx.eventoEstadia.create.mock.calls[0][0].data.detalle),
  ).toEqual({ ocupanteIds: [1] });
});
