jest.mock("../../lib/prisma", () => ({
  habitacion: { findMany: jest.fn() },
  planTarifario: { findFirst: jest.fn() },
}));
jest.mock("../reservas/reservas.servicio", () => ({
  ...jest.requireActual("../reservas/reservas.servicio"),
  consultarDisponibilidad: jest.fn(),
  cotizarParaReserva: jest.fn(),
}));
const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const reservasServicio = require("../reservas/reservas.servicio");
const { hoyComoFechaUTC } = require("../../lib/fechas");
const { getTipos, getDisponibilidad, postCotizar } = require("./ecommerce.controlador");

const CLAVES_PROHIBIDAS = ["habitacionId", "numero", "huesped", "detalle", "codigoConfirmacion"];

function clavesProhibidas(valor, ruta = "$") {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => clavesProhibidas(v, `${ruta}[${i}]`));
  if (!valor || typeof valor !== "object") return [];
  return Object.entries(valor).flatMap(([clave, v]) => [
    ...(CLAVES_PROHIBIDAS.includes(clave) ? [`${ruta}.${clave}`] : []),
    ...clavesProhibidas(v, `${ruta}.${clave}`),
  ]);
}

function dia(desplazamiento) {
  const fecha = hoyComoFechaUTC();
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
}

async function llamar(handler, req) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
  res.status.mockImplementation((codigo) => {
    res.statusCode = codigo;
    return res;
  });
  await handler({ query: {}, body: {}, ...req }, res);
  return { status: res.statusCode ?? 200, body: res.json.mock.calls[0][0] };
}

// Lo que devuelven de verdad la base y reservas.servicio.js, con todas sus
// claves internas (números de habitación, detalle por noche, etc.).
const HABITACIONES_ACTIVAS = [
  { capacidad: 2, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
  { capacidad: 4, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
  { capacidad: 2, tipoHabitacionId: 2, tipoHabitacion: { nombre: "Simple", activo: true } },
];

function planMotor(codigo, total, habitaciones = []) {
  return {
    codigo,
    nombre: codigo,
    tipo: "BASE",
    reembolsable: codigo === "BAR",
    horasCancelacionSinCargo: codigo === "BAR" ? 48 : null,
    penalidadNoShow: "PRIMERA_NOCHE",
    visibleWeb: true,
    planTarifarioId: codigo === "BAR" ? 1 : 2,
    detalle: [{ fecha: dia(7), precioNoche: total / 2 }],
    habitaciones,
    total,
    promedioPorNoche: total / 2,
  };
}

const libre = (id, tipoHabitacionId, capacidad) => ({
  id,
  numero: `${200 + id}`,
  tipo: tipoHabitacionId === 1 ? "Doble" : "Simple",
  tipoHabitacionId,
  capacidad,
  piso: 2,
  estado: "libre",
  planes: [],
});

const DISPONIBILIDAD = {
  fechaDesde: new Date(),
  fechaHasta: new Date(),
  noches: 2,
  habitaciones: [libre(1, 1, 2), libre(2, 1, 4), libre(3, 1, 2), libre(4, 2, 2)],
  resumenPorTipo: [
    { tipoHabitacionId: 1, tipo: "Doble", planes: [planMotor("BAR", 88000), planMotor("NRF", 74800)], motivoNoDisponible: null },
    { tipoHabitacionId: 2, tipo: "Simple", planes: [planMotor("BAR", 66000)], motivoNoDisponible: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.habitacion.findMany.mockResolvedValue(HABITACIONES_ACTIVAS);
  prisma.planTarifario.findFirst.mockResolvedValue({ id: 2 });
  reservasServicio.consultarDisponibilidad.mockResolvedValue(DISPONIBILIDAD);
});

test("GET /tipos: tipos vendibles con capacidadMaxima y sin claves prohibidas", async () => {
  const { status, body } = await llamar(getTipos, {});
  expect(status).toBe(200);
  expect(body).toEqual({
    tipos: [
      { tipoHabitacionId: 1, nombre: "Doble", capacidadMaxima: 4 },
      { tipoHabitacionId: 2, nombre: "Simple", capacidadMaxima: 2 },
    ],
  });
  expect(clavesProhibidas(body)).toEqual([]);
});

test("GET /disponibilidad: canal WEB, sin capacidadMinima ni ocupadas, y sin claves prohibidas", async () => {
  const { status, body } = await llamar(getDisponibilidad, {
    query: { fechaDesde: dia(7), fechaHasta: dia(9), adultos: "2", menores: "0" },
  });
  expect(status).toBe(200);
  expect(reservasServicio.consultarDisponibilidad).toHaveBeenCalledWith({
    fechaDesde: dia(7),
    fechaHasta: dia(9),
    adultos: 2,
    menores: 0,
    canal: "WEB",
  });
  expect(body.tipos).toHaveLength(2);
  expect(body.tipos[0].planes.map((p) => p.total)).toEqual([88000, 74800]);
  expect(clavesProhibidas(body)).toEqual([]);
});

test("GET /disponibilidad con parámetros inválidos → 400 DATOS_INVALIDOS con campo", async () => {
  const { status, body } = await llamar(getDisponibilidad, { query: { fechaDesde: dia(7), fechaHasta: dia(9), adultos: "0" } });
  expect(status).toBe(400);
  expect(body).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "adultos" });
  expect(reservasServicio.consultarDisponibilidad).not.toHaveBeenCalled();
});

describe("POST /cotizar", () => {
  const cuerpo = (habitaciones) => ({ fechaDesde: dia(7), fechaHasta: dia(9), planTarifarioId: 2, habitaciones });

  test("mismo total que la disponibilidad, con dos representantes distintos y sin claves prohibidas", async () => {
    reservasServicio.cotizarParaReserva.mockResolvedValue({
      noches: 2,
      planes: [
        planMotor("NRF", 74800 * 2, [
          { habitacionId: 1, numero: "201", detalle: [{ fecha: dia(7), precioNoche: 34000 }, { fecha: dia(8), precioNoche: 40800 }], total: 74800 },
          { habitacionId: 3, numero: "203", detalle: [{ fecha: dia(7), precioNoche: 34000 }, { fecha: dia(8), precioNoche: 40800 }], total: 74800 },
        ]),
      ],
    });
    const { status, body } = await llamar(postCotizar, {
      body: cuerpo([
        { tipoHabitacionId: 1, adultos: 2, menores: 0 },
        { tipoHabitacionId: 1, adultos: 2, menores: 0 },
      ]),
    });
    expect(status).toBe(200);
    expect(reservasServicio.cotizarParaReserva).toHaveBeenCalledWith({
      fechaDesde: dia(7),
      fechaHasta: dia(9),
      planTarifarioId: 2,
      habitaciones: [
        { habitacionId: 1, adultos: 2, menores: 0 },
        { habitacionId: 3, adultos: 2, menores: 0 },
      ],
      canal: "WEB",
    });
    const nrfDisponibilidad = DISPONIBILIDAD.resumenPorTipo[0].planes[1].total;
    const noches = [{ fecha: dia(7), precio: 34000 }, { fecha: dia(8), precio: 40800 }];
    expect(body.habitaciones).toEqual([
      { tipo: "Doble", adultos: 2, menores: 0, subtotal: nrfDisponibilidad, noches },
      { tipo: "Doble", adultos: 2, menores: 0, subtotal: nrfDisponibilidad, noches },
    ]);
    // La suma de las noches es exactamente el subtotal de cada línea.
    for (const h of body.habitaciones) {
      expect(h.noches.reduce((acc, n) => acc.plus(new Prisma.Decimal(n.precio)), new Prisma.Decimal(0)).equals(new Prisma.Decimal(h.subtotal))).toBe(true);
    }
    expect(body.total).toBe(nrfDisponibilidad * 2);
    expect(clavesProhibidas(body)).toEqual([]);
  });

  test("sin habitación representante → 409 SIN_DISPONIBILIDAD y no se cotiza", async () => {
    const { status, body } = await llamar(postCotizar, {
      body: cuerpo([
        { tipoHabitacionId: 2, adultos: 2, menores: 0 },
        { tipoHabitacionId: 2, adultos: 1, menores: 0 },
      ]),
    });
    expect(status).toBe(409);
    expect(body.codigo).toBe("SIN_DISPONIBILIDAD");
    expect(reservasServicio.cotizarParaReserva).not.toHaveBeenCalled();
  });

  test("tarifa no visible en la web → 400 DATOS_INVALIDOS en planTarifarioId", async () => {
    prisma.planTarifario.findFirst.mockResolvedValue(null);
    const { status, body } = await llamar(postCotizar, { body: cuerpo([{ tipoHabitacionId: 1, adultos: 2, menores: 0 }]) });
    expect(status).toBe(400);
    expect(body).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "planTarifarioId" });
  });

  test("tipo que no se vende en la web → 400 DATOS_INVALIDOS con campo de la línea", async () => {
    const { status, body } = await llamar(postCotizar, { body: cuerpo([{ tipoHabitacionId: 9, adultos: 2, menores: 0 }]) });
    expect(status).toBe(400);
    expect(body.campo).toBe("habitaciones[0].tipoHabitacionId");
  });

  test("un error de negocio del motor con mensaje seguro llega con ese mensaje", async () => {
    reservasServicio.cotizarParaReserva.mockRejectedValue(
      new reservasServicio.ErrorDeNegocio("La estadía mínima para esta reserva es de 3 noches", 409)
    );
    const { status, body } = await llamar(postCotizar, { body: cuerpo([{ tipoHabitacionId: 1, adultos: 2, menores: 0 }]) });
    expect(status).toBe(400);
    expect(body).toEqual({ error: "La estadía mínima para esta reserva es de 3 noches", codigo: "DATOS_INVALIDOS" });
  });
});
