import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HabitacionDetallePage } from "./HabitacionDetallePage";
import { obtenerHabitacion } from "./habitaciones.api";
import { listarReservas } from "../reservas/reservas.api";

vi.mock("../../lib/sesion", () => ({
  useSesion: () => ({ rol: "admin", puede: () => true }),
}));

vi.mock("./habitaciones.api", () => ({
  obtenerHabitacion: vi.fn(),
  cambiarActivoHabitacion: vi.fn(),
}));

vi.mock("../reservas/reservas.api", () => ({
  listarReservas: vi.fn(),
}));

const BASE = {
  id: 301,
  numero: "301",
  tipo: "Doble",
  capacidad: 2,
  piso: 3,
  equipamiento: "Aire acondicionado, TV smart",
  tarifaPorNoche: "18500",
  activo: true,
  motivoBloqueo: null,
  ordenesMantenimiento: [],
};

const RESERVA_ACTIVA = {
  id: 3,
  codigoConfirmacion: "517736B1",
  fechaDesde: "2026-09-19T00:00:00.000Z",
  fechaHasta: "2026-09-22T00:00:00.000Z",
  noches: 3,
  huesped: { nombre: "Marcos Beltrán", numeroDocumento: "32145998" },
  habitaciones: [{ id: 301, numero: "301" }],
};

function renderDetalle(id = 301) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/habitaciones/${id}`]}>
        <Routes>
          <Route path="/habitaciones/:id" element={<HabitacionDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("HabitacionDetallePage — sección 'Reserva activa'", () => {
  it('se muestra cuando la habitación está "ocupada" y tiene una reserva "En curso"', async () => {
    obtenerHabitacion.mockResolvedValue({ ...BASE, estado: "ocupada" });
    listarReservas.mockResolvedValue([RESERVA_ACTIVA]);

    renderDetalle();

    expect(await screen.findByText("Reserva activa")).toBeInTheDocument();
    expect(screen.getByText(/Marcos Beltrán/)).toBeInTheDocument();
    expect(screen.getByText("517736B1")).toBeInTheDocument();
  });

  it('no se muestra cuando la habitación está "libre"', async () => {
    obtenerHabitacion.mockResolvedValue({ ...BASE, estado: "libre" });
    listarReservas.mockResolvedValue([]);

    renderDetalle();

    // Esperamos a que termine de cargar (aparece un dato propio de la
    // habitación) antes de afirmar que la sección no está.
    expect(await screen.findByText("Datos generales")).toBeInTheDocument();
    expect(screen.queryByText("Reserva activa")).not.toBeInTheDocument();
    expect(listarReservas).not.toHaveBeenCalled();
  });
});

describe("HabitacionDetallePage — sección 'Motivo de bloqueo'", () => {
  it('se muestra cuando la habitación está "bloqueada" y tiene motivoBloqueo', async () => {
    obtenerHabitacion.mockResolvedValue({ ...BASE, estado: "bloqueada", motivoBloqueo: "Reforma de baño" });

    renderDetalle();

    expect(await screen.findByText("Motivo de bloqueo")).toBeInTheDocument();
    expect(screen.getByText("Reforma de baño")).toBeInTheDocument();
  });

  it("no se muestra en otro estado, aunque motivoBloqueo tenga un valor viejo guardado", async () => {
    obtenerHabitacion.mockResolvedValue({ ...BASE, estado: "libre", motivoBloqueo: "Motivo de un bloqueo anterior" });
    listarReservas.mockResolvedValue([]);

    renderDetalle();

    expect(await screen.findByText("Datos generales")).toBeInTheDocument();
    expect(screen.queryByText("Motivo de bloqueo")).not.toBeInTheDocument();
  });
});
