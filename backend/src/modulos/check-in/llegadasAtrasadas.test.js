// HU-118: llegadas atrasadas (llegaban ayer), candidatas a no-show (antes de ayer), ingresadas hoy y datos de la reserva web.
// Las fechas se arman con el reloj simulado: "hoy" es siempre el día calendario argentino.
jest.mock("../../lib/prisma", () => ({ reserva: { findMany: jest.fn(), count: jest.fn() }, ocupanteReserva: { groupBy: jest.fn() } }));
const prisma = require("../../lib/prisma");
const { listarLlegadas } = require("./checkIn.apoyo.servicio");

const dia = (iso) => new Date(`${iso}T00:00:00.000Z`);

function reserva(id, { desde = "2026-10-09", hasta = "2026-10-11", datosWeb = null, preferencias = null, estadoHabitacion = "libre" } = {}) {
  return {
    id,
    codigoConfirmacion: `0000000${id}`,
    fechaDesde: dia(desde),
    fechaHasta: dia(hasta),
    huesped: { nombre: "Ana Pérez", nombres: "Ana", apellido: "Pérez", tipoDocumento: "DNI", numeroDocumento: "1", paisDocumento: "AR", preferencias },
    planTarifario: { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true },
    reservaHabitaciones: [
      {
        habitacion: { id: 6, numero: "305", tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble" }, capacidad: 2, estado: estadoHabitacion },
        adultos: 2,
        menores: 0,
        reservaNoches: [{ precioNoche: "40000" }],
      },
    ],
    pagosEstadia: [],
    garantiaReserva: null,
    datosWeb,
  };
}

// findMany: 1.ª llamada = de hoy, 2.ª = atrasadas, 3.ª = ingresadas hoy (solo si hubo ingresos).
const consulta = (n) => prisma.reserva.findMany.mock.calls[n][0];

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-09T15:00:00.000Z")); // 12:00 en Argentina
  jest.clearAllMocks();
  prisma.reserva.count.mockResolvedValue(0);
  prisma.reserva.findMany.mockResolvedValue([]);
  prisma.ocupanteReserva.groupBy.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

describe("atrasadas", () => {
  test("Confirmadas con llegada AYER y salida hoy o después, con el mismo orden y tope que las de hoy", async () => {
    await listarLlegadas({});
    const atrasadas = consulta(1);
    expect(atrasadas.where.estado).toBe("Confirmada");
    expect(atrasadas.where.fechaDesde).toEqual({ gte: dia("2026-10-08"), lt: dia("2026-10-09") }); // anteayer queda afuera
    expect(atrasadas.where.fechaHasta).toEqual({ gte: dia("2026-10-09") }); // salida anterior a hoy queda afuera
    expect(atrasadas.orderBy).toEqual(consulta(0).orderBy);
    expect(atrasadas.take).toBe(200);
  });

  test("las de hoy siguen siendo las de siempre", async () => {
    await listarLlegadas({});
    expect(consulta(0).where.fechaDesde).toEqual({ gte: dia("2026-10-09"), lt: dia("2026-10-10") });
  });

  test("devuelve las atrasadas con la misma forma que las de hoy", async () => {
    prisma.reserva.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([reserva(7, { desde: "2026-10-08" })]);
    const { reservas, atrasadas } = await listarLlegadas({});
    expect(reservas).toEqual([]);
    expect(atrasadas).toHaveLength(1);
    expect(atrasadas[0]).toMatchObject({ id: 7, codigoConfirmacion: "00000007", noches: 3 });
  });

  test("a las 00:30 en Argentina la reserva con llegada del día anterior es atrasada, no de hoy", async () => {
    jest.setSystemTime(new Date("2026-10-09T03:30:00.000Z")); // 00:30 del 9 en Argentina
    await listarLlegadas({});
    expect(consulta(0).where.fechaDesde).toEqual({ gte: dia("2026-10-09"), lt: dia("2026-10-10") });
    expect(consulta(1).where.fechaDesde).toEqual({ gte: dia("2026-10-08"), lt: dia("2026-10-09") });
  });

  test("a las 23:30 en Argentina (ya es el día siguiente en UTC) 'hoy' sigue siendo el día argentino", async () => {
    jest.setSystemTime(new Date("2026-10-10T02:30:00.000Z")); // 23:30 del 9 en Argentina
    await listarLlegadas({});
    expect(consulta(0).where.fechaDesde).toEqual({ gte: dia("2026-10-09"), lt: dia("2026-10-10") });
  });
});

describe("pendientes de no-show", () => {
  test("pendientesNoShow cuenta las Confirmadas anteriores a AYER y sin filtro de texto; anterioresPendientes sigue siendo < hoy", async () => {
    prisma.reserva.count.mockImplementation(({ where }) => Promise.resolve(where.fechaDesde.lt.getTime() === dia("2026-10-09").getTime() ? 5 : 2));
    const r = await listarLlegadas({ q: "Pérez" });
    expect(r.anterioresPendientes).toBe(5);
    expect(r.pendientesNoShow).toBe(2);
    const filtros = prisma.reserva.count.mock.calls.map(([a]) => a.where);
    expect(filtros).toContainEqual({ estado: "Confirmada", fechaDesde: { lt: dia("2026-10-09") } });
    expect(filtros).toContainEqual({ estado: "Confirmada", fechaDesde: { lt: dia("2026-10-08") } });
  });
});

describe("ingresadas hoy", () => {
  test("agrupa por reserva el PRIMER ingreso (mínimo) y pide el día argentino completo: de 00:00 a 24:00 hora argentina", async () => {
    await listarLlegadas({});
    const grupo = prisma.ocupanteReserva.groupBy.mock.calls[0][0];
    expect(grupo.by).toEqual(["reservaId"]);
    expect(grupo._min).toEqual({ ingresoReal: true });
    // Las 00:00 del 9 en Argentina son las 03:00 UTC: un ingreso a las 23:59 del 8 queda afuera y uno a las 00:00 del 9 entra.
    expect(grupo.having).toEqual({
      ingresoReal: { _min: { gte: new Date("2026-10-09T03:00:00.000Z"), lt: new Date("2026-10-10T03:00:00.000Z") } },
    });
  });

  test("sin ingresos hoy no hace la consulta de reservas", async () => {
    const { ingresadasHoy } = await listarLlegadas({});
    expect(ingresadasHoy).toEqual([]);
    expect(prisma.reserva.findMany).toHaveBeenCalledTimes(2);
  });

  test("devuelve la hora del primer ingreso, ordena por hora descendente y trae todo en una sola consulta por lote", async () => {
    prisma.ocupanteReserva.groupBy.mockResolvedValue([
      { reservaId: 1, _min: { ingresoReal: new Date("2026-10-09T13:00:00.000Z") } },
      { reservaId: 2, _min: { ingresoReal: new Date("2026-10-09T16:10:00.000Z") } },
      { reservaId: 3, _min: { ingresoReal: new Date("2026-10-09T14:00:00.000Z") } },
    ]);
    prisma.reserva.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.id?.in ? where.id.in.map((id) => reserva(id, { desde: id === 3 ? "2026-10-08" : "2026-10-09" })) : []),
    );
    const { ingresadasHoy } = await listarLlegadas({});
    expect(ingresadasHoy.map((r) => r.id)).toEqual([2, 3, 1]);
    expect(ingresadasHoy[0].horaIngreso).toBe("2026-10-09T16:10:00.000Z");
    // fechaDesde viaja para distinguir las atrasadas que ingresaron hoy.
    expect(ingresadasHoy.find((r) => r.id === 3).fechaDesde).toEqual(dia("2026-10-08"));
    expect(ingresadasHoy[0]).not.toHaveProperty("esWalkIn");
    const pedidasPorLote = prisma.reserva.findMany.mock.calls.filter(([a]) => a.where.id?.in);
    expect(pedidasPorLote).toHaveLength(1);
    expect(pedidasPorLote[0][0].where.id.in.sort()).toEqual([1, 2, 3]);
  });

  test("aplica el mismo filtro de texto y el tope de 200", async () => {
    const grupos = Array.from({ length: 230 }, (_, i) => ({ reservaId: i + 1, _min: { ingresoReal: new Date(Date.UTC(2026, 9, 9, 5, 0, i)) } }));
    prisma.ocupanteReserva.groupBy.mockResolvedValue(grupos);
    prisma.reserva.findMany.mockImplementation(({ where }) => Promise.resolve(where.id?.in ? where.id.in.map((id) => reserva(id)) : []));
    const { ingresadasHoy } = await listarLlegadas({ q: "305" });
    expect(ingresadasHoy).toHaveLength(200);
    const pedida = prisma.reserva.findMany.mock.calls.find(([a]) => a.where.id?.in)[0];
    expect(pedida.where.OR).toEqual(consulta(0).where.OR);
  });
});

describe("datos de la reserva web y preferencias", () => {
  test("esWeb, hora estimada, solicitudes especiales y preferencias del huésped", async () => {
    prisma.reserva.findMany.mockResolvedValueOnce([
      reserva(1, { datosWeb: { horaEstimadaLlegada: "18:30", solicitudesEspeciales: "Cuna" }, preferencias: "Piso alto" }),
      reserva(2),
    ]);
    const { reservas } = await listarLlegadas({});
    expect(reservas[0]).toMatchObject({ esWeb: true, horaEstimadaLlegada: "18:30", solicitudesEspeciales: "Cuna" });
    expect(reservas[0].titular.preferencias).toBe("Piso alto");
    expect(reservas[1]).toMatchObject({ esWeb: false, horaEstimadaLlegada: null, solicitudesEspeciales: null });
    expect(reservas[1].titular.preferencias).toBeNull();
    expect(JSON.stringify(reservas)).not.toMatch(/emailContacto|telefonoContacto|tarjeta|garantiaToken/);
  });

  test("el estado de la habitación viaja para marcar las que no están listas", async () => {
    prisma.reserva.findMany.mockResolvedValueOnce([reserva(1, { estadoHabitacion: "en limpieza" })]);
    const { reservas } = await listarLlegadas({});
    expect(reservas[0].habitaciones[0].estado).toBe("en limpieza");
  });
});

describe("búsqueda por habitación", () => {
  test("suma, con OR, el número de habitación exacto (recortado) a código, nombre y documento", async () => {
    await listarLlegadas({ q: "  305 " });
    const ors = consulta(0).where.OR;
    expect(ors).toContainEqual({ reservaHabitaciones: { some: { habitacion: { numero: "305" } } } });
    expect(ors).toContainEqual({ codigoConfirmacion: { contains: "305" } });
    expect(ors).toContainEqual({ huesped: { nombre: { contains: "305" } } });
    expect(consulta(0).where.AND).toBeUndefined();
  });

  test("la misma búsqueda se aplica a las atrasadas", async () => {
    await listarLlegadas({ q: "305" });
    expect(consulta(1).where.OR).toEqual(consulta(0).where.OR);
  });
});
