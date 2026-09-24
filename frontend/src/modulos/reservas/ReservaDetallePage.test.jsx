import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { ReservaDetallePage } from "./ReservaDetallePage";
import { useSesion } from "../../lib/sesion";
import { obtenerReserva } from "./reservas.api";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { obtenerResumenPorReserva } from "../servicios-adicionales/serviciosAdicionales.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("./reservas.api", () => ({ obtenerReserva: vi.fn(), cancelarReserva: vi.fn() }));
vi.mock("../check-in/checkIn.api", () => ({ buscarReservaParaCheckIn: vi.fn() }));
vi.mock("../servicios-adicionales/serviciosAdicionales.api", () => ({ obtenerResumenPorReserva: vi.fn() }));

const RESERVA_BASE = {
  id: 5,
  codigoConfirmacion: "RS-DET01",
  estado: "Confirmada",
  motivoCancelacion: null,
  fechaDesde: "2026-09-20T00:00:00.000Z",
  fechaHasta: "2026-09-23T00:00:00.000Z",
  noches: 3,
  totalEstimadoAlojamiento: 90000,
  cantidadHabitaciones: 1,
  huesped: { nombre: "Marcos Beltrán", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "", preferencias: "" },
  habitaciones: [{ id: 1, numero: "301", tipo: "Doble", capacidad: 2, piso: 3, estado: "libre", tarifaPorNoche: 30000 }],
  notificaciones: [],
};

function CheckInStub() {
  const [params] = useSearchParams();
  return <p>Check-in codigo={params.get("codigo") ?? ""}</p>;
}

function renderDetalle() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/reservas/5"]}>
        <Routes>
          <Route path="/reservas/:id" element={<ReservaDetallePage />} />
          <Route path="/check-in" element={<CheckInStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue({ rol: "recepcionista", puede: () => true });
  obtenerResumenPorReserva.mockResolvedValue({ totalGeneral: 0, totalPorTipo: [], items: [] });
});

// La misma info (puedeIniciarCheckIn/motivoBloqueo) que ya calcula
// validarReservaVigente en checkIn.servicio.js (backend) — el frontend no
// reimplementa la comparación de fechas, solo reusa este endpoint.
describe("ReservaDetallePage — botón Iniciar check-in", () => {
  it("Confirmada con fecha de ingreso ya llegada: botón habilitado y lleva a Check-in con esa reserva", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA_BASE, puedeIniciarCheckIn: true, motivoBloqueo: null });

    renderDetalle();

    const boton = await screen.findByRole("button", { name: /Iniciar check-in/ });
    await waitFor(() => expect(boton).toBeEnabled());

    await userEvent.setup().click(boton);
    expect(await screen.findByText(`Check-in codigo=${RESERVA_BASE.codigoConfirmacion}`)).toBeInTheDocument();
  });

  it("Confirmada con fecha de ingreso futura: botón deshabilitado con el motivo real del backend", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    const motivo = 'El check-in habilita a partir del 25/09/2026 (fecha de ingreso de la reserva).';
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA_BASE, puedeIniciarCheckIn: false, motivoBloqueo: motivo });

    renderDetalle();

    const boton = await screen.findByRole("button", { name: /Iniciar check-in/ });
    expect(boton).toBeDisabled();
    expect(await screen.findByText(motivo)).toBeInTheDocument();
  });

  it('reserva "En curso": el botón no se muestra (no es un tema de fecha, es de estado)', async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });

    renderDetalle();

    await screen.findByText(RESERVA_BASE.huesped.nombre);
    expect(screen.queryByRole("button", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });

  it('reserva "Cancelada": el botón no se muestra', async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cancelada", motivoCancelacion: "El huésped se arrepintió" });

    renderDetalle();

    await screen.findByText(RESERVA_BASE.huesped.nombre);
    expect(screen.queryByRole("button", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });
});
