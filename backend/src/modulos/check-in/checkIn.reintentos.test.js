// Reintentos que no rompen (idempotencia natural, sin cambios de esquema) y habitación ocupada por OTRA estadía.
jest.mock("../../lib/prisma", () => ({
  habitacion: { findMany: jest.fn() },
  huesped: { findUnique: jest.fn(), findMany: jest.fn() },
  reserva: { findFirst: jest.fn(), findMany: jest.fn() },
  ocupanteReserva: { findMany: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock("../reservas/reservas.servicio", () => ({
  ErrorDeNegocio: class extends Error {},
  obtenerReserva: jest.fn(),
  normalizarAltaReserva: jest.fn(),
  buscarConflictos: jest.fn(),
  errorPorConflictos: jest.fn(),
  cotizarReservaEnvuelto: jest.fn(),
  reservarCodigoLibre: jest.fn(),
  armarNotificacionConfirmacion: jest.fn(),
  exigirMismoNombre: jest.fn(),
  hoyComoFechaUTC: () => new Date(),
}));
jest.mock("../garantias/garantiaEstadia.servicio", () => ({
  iniciarGarantiaDeCheckIn: jest.fn(),
  ErrorDeNegocio: class extends Error {},
}));

const prisma = require("../../lib/prisma");
const reservasServicio = require("../reservas/reservas.servicio");
const garantiaServicio = require("../garantias/garantiaEstadia.servicio");
const servicio = require("./checkIn.servicio");
const { claveDocumento } = require("../estadia/persona.servicio");

const hoy = new Date(Date.UTC(2026, 9, 7));
const manana = new Date(Date.UTC(2026, 9, 8));

beforeEach(() => {
  jest.clearAllMocks();
  prisma.ocupanteReserva.findMany.mockResolvedValue([]);
  prisma.huesped.findMany.mockResolvedValue([]);
  prisma.reserva.findMany.mockResolvedValue([]);
});

describe("check-in con reserva: reintento de uno que ya se confirmó", () => {
  const reservaEnCurso = { id: 40, estado: "En curso", habitaciones: [{ id: 7 }, { id: 8 }] };
  const personas = [
    { tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30.111.222", nombre: "Ana", apellido: "Pérez" },
    { tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30111333", nombre: "Luis", apellido: "Gómez" },
  ];
  const alojados = [
    { nombre: "Ana", apellido: "Pérez", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30111222", fechaNacimiento: null },
    { nombre: "Luis", apellido: "Gómez", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30111333", fechaNacimiento: null },
  ];
  const habitaciones = [{ habitacionId: 7 }, { habitacionId: 8 }];

  test("En curso con las mismas habitaciones y las mismas personas → es el mismo check-in (200 con el resultado existente)", async () => {
    prisma.ocupanteReserva.findMany.mockResolvedValue(alojados);
    await expect(servicio.esCheckInYaConfirmado(reservaEnCurso, habitaciones, personas)).resolves.toBe(true);
    expect(prisma.ocupanteReserva.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { reservaId: 40, estado: "Alojado" } }));
  });

  test("otra persona, otra habitación o una reserva que no está En curso → NO es el mismo check-in", async () => {
    prisma.ocupanteReserva.findMany.mockResolvedValue(alojados);
    const otraPersona = [personas[0], { ...personas[1], numeroDocumento: "99999999" }];
    await expect(servicio.esCheckInYaConfirmado(reservaEnCurso, habitaciones, otraPersona)).resolves.toBe(false);
    await expect(servicio.esCheckInYaConfirmado(reservaEnCurso, [{ habitacionId: 7 }, { habitacionId: 9 }], personas)).resolves.toBe(false);
    await expect(servicio.esCheckInYaConfirmado({ ...reservaEnCurso, estado: "Confirmada" }, habitaciones, personas)).resolves.toBe(false);
    prisma.ocupanteReserva.findMany.mockResolvedValue([alojados[0]]);
    await expect(servicio.esCheckInYaConfirmado(reservaEnCurso, habitaciones, personas)).resolves.toBe(false);
  });

  test("un menor sin documento se reconoce por nombre, apellido y fecha de nacimiento", async () => {
    const menor = { nombre: "Tomás", apellido: "Pérez", fechaNacimiento: "2018-05-10" };
    prisma.ocupanteReserva.findMany.mockResolvedValue([{ ...menor, tipoDocumento: null, paisDocumento: null, numeroDocumento: null, fechaNacimiento: new Date("2018-05-10T00:00:00Z") }]);
    await expect(servicio.esCheckInYaConfirmado({ id: 41, estado: "En curso", habitaciones: [{ id: 7 }] }, [{ habitacionId: 7 }], [menor])).resolves.toBe(true);
  });
});

describe("walk-in: reintento de uno que ya se confirmó", () => {
  const titular = { tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30111222" };
  const datos = { fechaDesde: hoy, fechaHasta: manana, habitaciones: [{ habitacionId: 20 }] };

  test("busca una reserva En curso del mismo titular, misma habitación y fechas, con ingreso de hace menos de 5 minutos", async () => {
    prisma.huesped.findUnique.mockResolvedValue({ id: 5 });
    prisma.reserva.findFirst.mockResolvedValue({ id: 77, reservaHabitaciones: [{ habitacionId: 20 }] });
    const antes = Date.now();
    const r = await servicio.buscarWalkInReciente({ titular, datos });
    expect(r.id).toBe(77);
    expect(prisma.huesped.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { identidadDocumento: claveDocumento(titular) } }));
    const { where } = prisma.reserva.findFirst.mock.calls[0][0];
    expect(where).toMatchObject({ estado: "En curso", huespedId: 5, fechaDesde: hoy, fechaHasta: manana });
    const desde = where.historialEstadia.some.fecha.gte.getTime();
    expect(where.historialEstadia.some.accion).toBe("Check-in: ocupantes registrados");
    expect(antes - desde).toBeGreaterThanOrEqual(5 * 60 * 1000 - 50);
    expect(antes - desde).toBeLessThan(5 * 60 * 1000 + 5000);
  });

  test("con otra habitación, sin ficha del titular o sin candidata → no es un reintento", async () => {
    prisma.huesped.findUnique.mockResolvedValue({ id: 5 });
    prisma.reserva.findFirst.mockResolvedValue({ id: 77, reservaHabitaciones: [{ habitacionId: 21 }] });
    await expect(servicio.buscarWalkInReciente({ titular, datos })).resolves.toBeNull();
    prisma.reserva.findFirst.mockResolvedValue(null);
    await expect(servicio.buscarWalkInReciente({ titular, datos })).resolves.toBeNull();
    prisma.huesped.findUnique.mockResolvedValue(null);
    await expect(servicio.buscarWalkInReciente({ titular, datos })).resolves.toBeNull();
    await expect(servicio.buscarWalkInReciente({ titular: {}, datos })).resolves.toBeNull();
  });

  test("el envío repetido devuelve la MISMA reserva, sin preautorizar otra garantía ni abrir una transacción", async () => {
    const persona = { id: 1, habitacionId: 20, esTitular: true, nombre: "Ana", apellido: "Pérez", ...titular, fechaNacimiento: "1985-04-10", nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", domicilio: "Calle 1", telefono: "3875550100" };
    prisma.habitacion.findMany.mockResolvedValue([{ id: 20, numero: "403", capacidad: 2, activo: true }]);
    reservasServicio.normalizarAltaReserva.mockImplementation((d) => ({ ...d, fechaDesde: hoy, fechaHasta: manana, habitaciones: [{ habitacionId: 20, adultos: 1, menores: 0 }], planTarifarioId: 1, totalEsperado: 30000 }));
    reservasServicio.buscarConflictos.mockResolvedValue([]);
    reservasServicio.cotizarReservaEnvuelto.mockResolvedValue({ planes: [{ total: 30000, habitaciones: [] }] });
    reservasServicio.reservarCodigoLibre.mockResolvedValue("ABCD1234");
    prisma.huesped.findUnique.mockResolvedValue({ id: 5 });
    prisma.reserva.findFirst.mockResolvedValue({ id: 77, reservaHabitaciones: [{ habitacionId: 20 }] });
    reservasServicio.obtenerReserva.mockResolvedValue({ id: 77, estado: "En curso" });

    const r = await servicio.registrarCheckInWalkIn({
      personas: [persona], operador: "recepcionista.prueba", fechaHasta: "2026-10-08",
      habitaciones: [{ habitacionId: 20, adultos: 1, menores: 0 }], planTarifarioId: 1, totalEsperado: 30000,
      garantiaConfirmada: true, medioGarantia: "Efectivo", claveIdempotencia: "otra-clave",
    });
    expect(r).toEqual({ id: 77, estado: "En curso" });
    expect(reservasServicio.obtenerReserva).toHaveBeenCalledWith(77);
    expect(garantiaServicio.iniciarGarantiaDeCheckIn).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("habitación ocupada por OTRA estadía sigue siendo un 409 con mensaje claro", () => {
  test("el updateMany condicional que no alcanza se explica con el número de la habitación", async () => {
    prisma.habitacion.findMany.mockResolvedValue([{ id: 20, numero: "403", estado: "ocupada" }]);
    const fn = () => Promise.reject(new servicio.HabitacionesNoLibres([20]));
    await expect(servicio.conConcurrenciaComo409(fn)).rejects.toMatchObject({
      statusCode: 409,
      message: "La habitación 403 ya está ocupada por otra estadía.",
    });
  });

  test("en limpieza o bloqueada: dice el estado actual; inexistente: 404", async () => {
    prisma.habitacion.findMany.mockResolvedValue([{ id: 20, numero: "403", estado: "en limpieza" }]);
    await expect(servicio.conConcurrenciaComo409(() => Promise.reject(new servicio.HabitacionesNoLibres([20])))).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('no está libre (estado actual: "en limpieza")'),
    });
    prisma.habitacion.findMany.mockResolvedValue([]);
    await expect(servicio.conConcurrenciaComo409(() => Promise.reject(new servicio.HabitacionesNoLibres([20])))).rejects.toMatchObject({ statusCode: 404 });
  });

  test("un P2034 (deadlock de MySQL entre dos operaciones) es el mismo 409", async () => {
    await expect(servicio.conConcurrenciaComo409(() => Promise.reject(Object.assign(new Error("x"), { code: "P2034" })))).rejects.toMatchObject({ statusCode: 409 });
  });
});
