// modificarReserva: reserva releída bajo bloqueo, control de totalEsperado y regla de tarifa no reembolsable: el total no baja (HU-96, provisoria hasta HU-118).
// Cliente doble (no es `prisma`): se ejecuta directo, sin transacción real.
jest.mock("../../lib/prisma", () => ({}));
jest.mock("../tarifas/cotizacion.servicio", () => ({
  cotizarReserva: jest.fn(),
  ErrorDeNegocio: class extends Error {},
}));
const cotizacion = require("../tarifas/cotizacion.servicio");
const { modificarReserva } = require("./reservas.servicio");

const DIA = 24 * 60 * 60 * 1000;
const hoy = new Date();
const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()) + 10 * DIA;
const noches = [new Date(base), new Date(base + DIA)];
const iso = (d) => d.toISOString().slice(0, 10);
const fechaDesde = new Date(base);
const fechaHasta = new Date(base + 2 * DIA);

const filaHabitacion = (id, habitacionId) => ({
  id,
  habitacionId,
  adultos: 2,
  menores: 0,
  reservaNoches: noches.map((fecha) => ({
    fecha,
    precioNoche: "100",
    temporadaId: 1,
    tarifaId: 1,
    origen: "MOTOR",
    precioOriginal: null,
    ajustada: false,
    motivoAjuste: null,
    ajustadoPor: null,
    ajustadoEn: null,
  })),
});

function reserva({ estado = "Confirmada", reembolsable = true, habitaciones = [10, 11] } = {}) {
  return {
    id: 1,
    estado,
    fechaDesde,
    fechaHasta,
    planTarifarioId: 1,
    planTarifario: { id: 1, reembolsable },
    reservaHabitaciones: habitaciones.map((hid, i) => filaHabitacion(i + 1, hid)),
  };
}

function clienteDoble(lecturas) {
  const cola = [...lecturas];
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    reserva: {
      findUnique: jest.fn(async () => (cola.length > 1 ? cola.shift() : cola[0])),
      update: jest.fn(),
    },
    habitacion: {
      findMany: jest.fn(async ({ where }) => where.id.in.map((id) => ({ id, numero: String(id), activo: true }))),
    },
    reservaHabitacion: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    reservaNoche: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
}

function cotizarConPrecioPorNoche(precio) {
  cotizacion.cotizarReserva.mockImplementation(async ({ habitaciones }) => ({
    planes: [
      {
        habitaciones: habitaciones.map((h) => ({
          habitacionId: h.habitacionId,
          numero: String(h.habitacionId),
          adultos: h.adultos,
          menores: h.menores,
          detalle: noches.map((f) => ({ fecha: iso(f), precioNoche: precio, temporadaId: 1, tarifaId: 1 })),
        })),
      },
    ],
  }));
}

const ocupacion = (...ids) => ids.map((habitacionId) => ({ habitacionId, adultos: 2, menores: 0 }));

beforeEach(() => {
  jest.clearAllMocks();
  cotizarConPrecioPorNoche(100);
});

describe("reserva releída bajo bloqueo", () => {
  test("si pasó a En curso entre la lectura y la escritura, falla y no escribe", async () => {
    const cliente = clienteDoble([reserva(), reserva({ estado: "En curso" })]);
    await expect(modificarReserva(1, { habitaciones: ocupacion(10) }, cliente)).rejects.toThrow(/En curso/);
    expect(cliente.$queryRaw).toHaveBeenCalledTimes(1);
    expect(cliente.reservaNoche.deleteMany).not.toHaveBeenCalled();
    expect(cliente.reservaNoche.createMany).not.toHaveBeenCalled();
    expect(cliente.reserva.update).not.toHaveBeenCalled();
  });

  test("si pasó a Cancelada entre la lectura y la escritura, falla y no escribe", async () => {
    const cliente = clienteDoble([reserva(), reserva({ estado: "Cancelada" })]);
    await expect(modificarReserva(1, { habitaciones: ocupacion(10) }, cliente)).rejects.toThrow(/Cancelada/);
    expect(cliente.reserva.update).not.toHaveBeenCalled();
  });

  test("la vista previa no bloquea ni relee", async () => {
    const cliente = clienteDoble([reserva()]);
    await modificarReserva(1, { habitaciones: ocupacion(10, 11), soloPrevia: true }, cliente);
    expect(cliente.$queryRaw).not.toHaveBeenCalled();
    expect(cliente.reserva.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe("totalEsperado", () => {
  test("distinto del total recalculado: 409 y no escribe", async () => {
    // Sin cambios de ocupación las noches conservan 100: el total nuevo es 400 (2 habitaciones × 2 noches).
    const cliente = clienteDoble([reserva()]);
    await expect(
      modificarReserva(1, { habitaciones: ocupacion(10, 11), totalEsperado: 450 }, cliente),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("El precio cambió desde la vista previa") });
    expect(cliente.reservaNoche.deleteMany).not.toHaveBeenCalled();
    expect(cliente.reserva.update).not.toHaveBeenCalled();
  });

  test("un valor no numérico se rechaza", async () => {
    const cliente = clienteDoble([reserva()]);
    await expect(modificarReserva(1, { totalEsperado: "abc" }, cliente)).rejects.toThrow(/totalEsperado/);
  });
});

describe("tarifa no reembolsable: el total de la estadía no puede bajar", () => {
  const MENSAJE = /el total de la estadía no puede bajar \(antes \$400,00, ahora \$/;

  test("reemplazar por una habitación del mismo valor o más cara se permite", async () => {
    const cliente = clienteDoble([reserva({ reembolsable: false })]);
    const igual = await modificarReserva(1, { habitaciones: ocupacion(10, 12), soloPrevia: true }, cliente);
    expect(igual.totalNuevo).toBe(400);
    // Las habitaciones nuevas se cotizan a 120 por noche: 100×2 (la que queda) + 120×2.
    cotizarConPrecioPorNoche(120);
    const mejor = await modificarReserva(1, { habitaciones: ocupacion(10, 12), soloPrevia: true }, cliente);
    expect(mejor.totalNuevo).toBeGreaterThanOrEqual(400);
  });

  test("reemplazar por una más barata falla, en la vista previa y al confirmar", async () => {
    cotizarConPrecioPorNoche(30);
    const cliente = clienteDoble([reserva({ reembolsable: false })]);
    await expect(modificarReserva(1, { habitaciones: ocupacion(12, 13), soloPrevia: true }, cliente)).rejects.toThrow(MENSAJE);
    await expect(modificarReserva(1, { habitaciones: ocupacion(12, 13) }, cliente)).rejects.toThrow(MENSAJE);
    expect(cliente.reserva.update).not.toHaveBeenCalled();
  });

  test("quitar una habitación de una reserva con varias falla", async () => {
    const cliente = clienteDoble([reserva({ reembolsable: false })]);
    await expect(modificarReserva(1, { habitaciones: ocupacion(10), soloPrevia: true }, cliente)).rejects.toThrow(MENSAJE);
    await expect(modificarReserva(1, { habitaciones: ocupacion(10) }, cliente)).rejects.toThrow(MENSAJE);
  });

  test("agregar una habitación se permite y se cotiza entera", async () => {
    const cliente = clienteDoble([reserva({ reembolsable: false, habitaciones: [10] })]);
    const previa = await modificarReserva(1, { habitaciones: ocupacion(10, 11), soloPrevia: true }, cliente);
    expect(previa.totalAnterior).toBe(200);
    expect(previa.totalNuevo).toBe(400);
  });

  test("el cambio de ocupación sigue respetando el Ajuste B (no baja el precio)", async () => {
    cotizarConPrecioPorNoche(80);
    const cliente = clienteDoble([reserva({ reembolsable: false, habitaciones: [10] })]);
    const previa = await modificarReserva(
      1,
      { habitaciones: [{ habitacionId: 10, adultos: 1, menores: 0 }], soloPrevia: true },
      cliente,
    );
    expect(previa.totalNuevo).toBe(200);
    expect(previa.mensajeNoReembolsable).toMatch(/no reembolsable/);
  });

  test("en un plan reembolsable sí se pueden quitar habitaciones", async () => {
    const cliente = clienteDoble([reserva()]);
    const previa = await modificarReserva(1, { habitaciones: ocupacion(10), soloPrevia: true }, cliente);
    expect(previa.totalNuevo).toBe(200);
  });
});
