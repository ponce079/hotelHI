import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { useSesion } from "../../lib/sesion";
import { listarArticulos } from "../articulos/articulos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { listarHabilitaciones } from "../articulo-deposito/articuloDeposito.api";
import { listarTiposMovimiento } from "../tipos-movimiento/tiposMovimiento.api";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { consultarStock } from "../stock/stock.api";
import { listarReservas } from "../reservas/reservas.api";
import { listarHabitaciones, listarOrdenesMantenimiento } from "../habitaciones/habitaciones.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));

vi.mock("../articulos/articulos.api", () => ({ listarArticulos: vi.fn().mockResolvedValue({ total: 0 }) }));
vi.mock("../depositos/depositos.api", () => ({ listarDepositos: vi.fn().mockResolvedValue([]) }));
vi.mock("../articulo-deposito/articuloDeposito.api", () => ({ listarHabilitaciones: vi.fn().mockResolvedValue([]) }));
vi.mock("../tipos-movimiento/tiposMovimiento.api", () => ({ listarTiposMovimiento: vi.fn().mockResolvedValue([]) }));
vi.mock("../movimientos/movimientos.api", () => ({ listarMovimientos: vi.fn().mockResolvedValue([]) }));
vi.mock("../stock/stock.api", () => ({ consultarStock: vi.fn().mockResolvedValue([]) }));

vi.mock("../reservas/reservas.api", () => ({ listarReservas: vi.fn().mockResolvedValue([]) }));
vi.mock("../habitaciones/habitaciones.api", () => ({
  listarHabitaciones: vi.fn().mockResolvedValue([]),
  listarOrdenesMantenimiento: vi.fn().mockResolvedValue([]),
}));

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listarArticulos.mockResolvedValue({ total: 0 });
  listarDepositos.mockResolvedValue([]);
  listarHabilitaciones.mockResolvedValue([]);
  listarTiposMovimiento.mockResolvedValue([]);
  listarMovimientos.mockResolvedValue([]);
  consultarStock.mockResolvedValue([]);
  listarReservas.mockResolvedValue([]);
  listarHabitaciones.mockResolvedValue([]);
  listarOrdenesMantenimiento.mockResolvedValue([]);
});

describe("DashboardPage — despacho por rol", () => {
  it("Recepcionista ve el Inicio operativo (llegadas/salidas/habitaciones), no el panel de stock", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", rolInfo: { label: "Recepcionista" }, usuario: "fer" });
    renderDashboard();

    expect(await screen.findByText(/Llegadas de hoy/)).toBeInTheDocument();
    expect(screen.getByText(/Salidas de hoy/)).toBeInTheDocument();
    expect(screen.getByText("Habitaciones")).toBeInTheDocument();
    expect(screen.getByText(/Mantenimiento pendiente/)).toBeInTheDocument();
    expect(screen.queryByText("Artículos activos")).not.toBeInTheDocument();
  });

  it.each(["admin", "deposito", "compras", "gerente"])(
    "%s mantiene el Dashboard de stock actual, sin las secciones de Recepción",
    async (rol) => {
      useSesion.mockReturnValue({ rol, rolInfo: { label: rol }, usuario: "u" });
      renderDashboard();

      expect(await screen.findByText("Hola, u")).toBeInTheDocument();
      expect(screen.queryByText(/Llegadas de hoy/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Salidas de hoy/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Mantenimiento pendiente/)).not.toBeInTheDocument();
    }
  );

  it("Housekeeping tampoco ve las secciones de Recepción (sigue con el Dashboard vacío de tarjetas)", async () => {
    useSesion.mockReturnValue({ rol: "housekeeping", rolInfo: { label: "Housekeeping" }, usuario: "hk" });
    renderDashboard();

    expect(await screen.findByText("Hola, hk")).toBeInTheDocument();
    expect(screen.queryByText(/Llegadas de hoy/)).not.toBeInTheDocument();
  });
});
