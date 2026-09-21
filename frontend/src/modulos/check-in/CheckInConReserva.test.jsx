import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CheckInConReserva } from "./CheckInConReserva";
import { buscarReservaParaCheckIn } from "./checkIn.api";

vi.mock("./checkIn.api", () => ({
  buscarReservaParaCheckIn: vi.fn(),
  confirmarCheckInConReserva: vi.fn(),
}));

const RESERVA = {
  id: 5,
  codigoConfirmacion: "RS-HOY01",
  estado: "Confirmada",
  cantidadHabitaciones: 1,
  huesped: { nombre: "Marcos Beltrán", tipoDocumento: "DNI", numeroDocumento: "30111222" },
  habitaciones: [{ numero: "301", tipo: "Doble" }],
  fechaDesde: "2026-09-21T00:00:00.000Z",
  fechaHasta: "2026-09-22T00:00:00.000Z",
  noches: 1,
};

function renderComponente(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CheckInConReserva {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// RecepcionistaInicio.jsx (Inicio del Recepcionista) linkea a
// /check-in?codigo=<codigoConfirmacion> desde el "→ Iniciar check-in" de
// una llegada de hoy — CheckInPage.jsx traduce ese query param a esta prop.
describe("CheckInConReserva — reserva preseleccionada por código", () => {
  it("con codigoPreseleccionado dispara la búsqueda automáticamente al montar, sin tipear nada", async () => {
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA, puedeIniciarCheckIn: true, motivoBloqueo: null });

    renderComponente({ codigoPreseleccionado: "RS-HOY01" });

    // El nombre del huésped aparece dos veces (ficha + PanelResumenCheckIn):
    // alcanza con confirmar que la búsqueda automática trajo la reserva.
    expect((await screen.findAllByText("Marcos Beltrán")).length).toBeGreaterThan(0);
    expect(buscarReservaParaCheckIn).toHaveBeenCalledWith({ codigo: "RS-HOY01" });
    expect(buscarReservaParaCheckIn).toHaveBeenCalledTimes(1);
  });

  it("sin codigoPreseleccionado no busca nada al montar (comportamiento manual de siempre)", () => {
    renderComponente();

    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });
});
