import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { listarLlegadasPendientes } from "./reservas.api";

vi.mock("../../lib/api", () => ({ api: { get: vi.fn() } }));

function fechaISO(diasDesdeHoy) {
  const hoy = new Date(`${hoyEnHoraLocal()}T00:00:00.000Z`);
  hoy.setUTCDate(hoy.getUTCDate() + diasDesdeHoy);
  return hoy.toISOString();
}

function reserva(id, fechaDesde) {
  return {
    id,
    codigoConfirmacion: `RS-${id}`,
    estado: "Confirmada",
    fechaDesde,
    huesped: { nombre: `Huésped ${id}` },
    habitaciones: [{ numero: "101", tipo: "Doble" }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// HU-43: a quién hay que hacerle check-in ahora — mismo universo que admite
// validarReservaVigente en checkIn.servicio.js (backend). La usan "Llegadas
// de hoy" (RecepcionistaInicio.jsx) y la lista por defecto del buscador de
// Check-in (CheckInConReserva.jsx).
describe("listarLlegadasPendientes", () => {
  it("trae reservas Confirmada con fechaDesde de hoy o de un día anterior", async () => {
    api.get.mockResolvedValue({
      data: [
        reserva(1, fechaISO(-1)), // ayer, sin check-in todavía: sigue pendiente
        reserva(2, fechaISO(0)), // hoy
      ],
    });

    const resultado = await listarLlegadasPendientes();

    expect(resultado.map((r) => r.id)).toEqual([1, 2]);
  });

  it("no trae una reserva Confirmada cuya fechaDesde es un día futuro", async () => {
    api.get.mockResolvedValue({ data: [reserva(3, fechaISO(1))] });

    const resultado = await listarLlegadasPendientes();

    expect(resultado).toEqual([]);
  });

  it("pide al backend solo el estado Confirmada, el resto del filtro es local", async () => {
    api.get.mockResolvedValue({ data: [] });

    await listarLlegadasPendientes();

    expect(api.get).toHaveBeenCalledWith("/reservas", { params: { estado: "Confirmada" } });
  });
});
