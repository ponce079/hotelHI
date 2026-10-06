// Validaciones de cancelarReserva / marcarNoShow / listarNoShowPendientes.
// El cobro en sí está probado en garantias/cierreReserva.test.js: acá se
// simula y se mira solo QUÉ reservas pueden cancelarse o marcarse no-show.

const mockPrisma = { reserva: { findUnique: jest.fn(), findMany: jest.fn() } };
const mockCerrar = jest.fn();

jest.mock("../../lib/prisma", () => mockPrisma);
jest.mock("../check-out/checkOut.servicio", () => ({ ErrorDeNegocio: class extends Error {}, consolidarCargos: jest.fn() }));
jest.mock("../../lib/correo", () => ({ enviarCorreo: jest.fn() }));
jest.mock("../garantias/cierreReserva.servicio", () => ({
  cerrarReservaConPenalidad: (...args) => mockCerrar(...args),
  ErrorDeNegocio: class extends Error {},
}));

const { hoyComoFechaUTC } = require("../../lib/fechas");
const reservasServicio = require("./reservas.servicio");

const DIA = 24 * 60 * 60 * 1000;
const dia = (offset) => new Date(hoyComoFechaUTC().getTime() + offset * DIA);
const fila = (extra = {}) => ({
  id: 7,
  codigoConfirmacion: "ABC123",
  estado: "Confirmada",
  fechaDesde: dia(-1),
  fechaHasta: dia(2),
  huespedId: 1,
  huesped: null,
  motivoCancelacion: null,
  reservaHabitaciones: [],
  ...extra,
});
const RESUMEN = { tipo: "NO_SHOW", estadoCobro: "COBRADO", monto: 50000 };

beforeEach(() => {
  jest.clearAllMocks();
  mockCerrar.mockResolvedValue(RESUMEN);
});

describe("cancelarReserva", () => {
  const motivo = { motivoCancelacion: "Cambio de planes" };

  test("reserva inexistente: 404", async () => {
    mockPrisma.reserva.findUnique.mockResolvedValueOnce(null);
    await expect(reservasServicio.cancelarReserva(7, motivo)).rejects.toMatchObject({ statusCode: 404 });
  });

  test.each([
    ["Cancelada", /ya está cancelada/],
    ["No-show", /ya fue marcada como no-show/],
    ["En curso", /ya alojado/],
    ["Cerrada", /ya alojado|No se puede cancelar/],
  ])("estado %s: no se puede cancelar y no se cobra nada", async (estado, mensaje) => {
    mockPrisma.reserva.findUnique.mockResolvedValueOnce(fila({ estado }));
    await expect(reservasServicio.cancelarReserva(7, motivo)).rejects.toThrow(mensaje);
    expect(mockCerrar).not.toHaveBeenCalled();
  });

  test("el motivo es obligatorio", async () => {
    await expect(reservasServicio.cancelarReserva(7, { motivoCancelacion: "  " })).rejects.toThrow(/motivo/i);
    expect(mockCerrar).not.toHaveBeenCalled();
  });

  test("Confirmada: delega en el cierre con la penalidad de CANCELACION y la devuelve junto a la reserva", async () => {
    mockPrisma.reserva.findUnique
      .mockResolvedValueOnce(fila({ fechaDesde: dia(10) }))
      .mockResolvedValueOnce(fila({ estado: "Cancelada", motivoCancelacion: "Cambio de planes" }));
    const r = await reservasServicio.cancelarReserva(7, motivo);

    expect(mockCerrar).toHaveBeenCalledWith({
      reservaId: 7,
      tipo: "CANCELACION",
      estadoDestino: "Cancelada",
      motivo: "Cambio de planes",
    });
    expect(r).toMatchObject({ id: 7, estado: "Cancelada", penalidad: RESUMEN });
  });
});

describe("marcarNoShow", () => {
  test("llegada de ayer: se marca, con el motivo por defecto", async () => {
    mockPrisma.reserva.findUnique
      .mockResolvedValueOnce(fila({ fechaDesde: dia(-1) }))
      .mockResolvedValueOnce(fila({ estado: "No-show" }));
    const r = await reservasServicio.marcarNoShow(7, {});

    expect(mockCerrar).toHaveBeenCalledWith({
      reservaId: 7,
      tipo: "NO_SHOW",
      estadoDestino: "No-show",
      motivo: "No-show: el huésped no se presentó.",
    });
    expect(r).toMatchObject({ estado: "No-show", penalidad: RESUMEN });
  });

  test("con observación: queda en el motivo", async () => {
    mockPrisma.reserva.findUnique.mockResolvedValue(fila());
    await reservasServicio.marcarNoShow(7, { motivo: "Avisó que no viajaba" });
    expect(mockCerrar.mock.calls[0][0].motivo).toBe("No-show: Avisó que no viajaba");
  });

  test.each([
    ["hoy", 0],
    ["mañana", 1],
  ])("llegada %s: todavía puede llegar, no corresponde no-show", async (_nombre, offset) => {
    mockPrisma.reserva.findUnique.mockResolvedValueOnce(fila({ fechaDesde: dia(offset) }));
    await expect(reservasServicio.marcarNoShow(7, {})).rejects.toThrow(/Todavía no corresponde/);
    expect(mockCerrar).not.toHaveBeenCalled();
  });

  test.each(["En curso", "Cancelada", "Cerrada"])("estado %s: solo se marca no-show una reserva Confirmada", async (estado) => {
    mockPrisma.reserva.findUnique.mockResolvedValueOnce(fila({ estado }));
    await expect(reservasServicio.marcarNoShow(7, {})).rejects.toThrow(/Solo se puede marcar no-show/);
    expect(mockCerrar).not.toHaveBeenCalled();
  });

  test("ya marcada: no se cobra dos veces", async () => {
    mockPrisma.reserva.findUnique.mockResolvedValueOnce(fila({ estado: "No-show" }));
    await expect(reservasServicio.marcarNoShow(7, {})).rejects.toThrow(/ya fue marcada/);
    expect(mockCerrar).not.toHaveBeenCalled();
  });

  test("inexistente: 404", async () => {
    mockPrisma.reserva.findUnique.mockResolvedValueOnce(null);
    await expect(reservasServicio.marcarNoShow(7, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("listarNoShowPendientes", () => {
  test("busca reservas Confirmadas con llegada anterior a hoy, las más viejas primero", async () => {
    mockPrisma.reserva.findMany.mockResolvedValueOnce([fila({ id: 3 }), fila({ id: 4 })]);
    const lista = await reservasServicio.listarNoShowPendientes();

    const { where, orderBy } = mockPrisma.reserva.findMany.mock.calls[0][0];
    expect(where.estado).toBe("Confirmada");
    expect(where.fechaDesde.lt.getTime()).toBe(hoyComoFechaUTC().getTime());
    expect(orderBy[0]).toEqual({ fechaDesde: "asc" });
    expect(lista.map((r) => r.id)).toEqual([3, 4]);
  });
});
