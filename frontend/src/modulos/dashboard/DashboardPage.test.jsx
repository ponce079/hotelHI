import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { useSesion } from "../../lib/sesion";
import { listarDepositos } from "../depositos/depositos.api";
import { listarHabilitaciones } from "../articulo-deposito/articuloDeposito.api";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { consultarStock } from "../stock/stock.api";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarLlegadasPendientes, listarReservas } from "../reservas/reservas.api";
import { listarHabitaciones, listarOrdenesMantenimiento } from "../habitaciones/habitaciones.api";
import { listarArticulos } from "../articulos/articulos.api";
import { listarProveedores } from "../proveedores/proveedores.api";

// Se mockean TODAS las dependencias de los tres paneles (Admin, Recepcionista
// y el de Stock/Compras) porque DashboardPage.jsx los importa a los tres sin
// condicionar el import — el que efectivamente dispara sus queries es el que
// elige rol, pero el módulo entero se evalúa igual.
vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("../depositos/depositos.api", () => ({ listarDepositos: vi.fn() }));
vi.mock("../articulo-deposito/articuloDeposito.api", () => ({ listarHabilitaciones: vi.fn() }));
vi.mock("../movimientos/movimientos.api", () => ({ listarMovimientos: vi.fn() }));
vi.mock("../stock/stock.api", () => ({ consultarStock: vi.fn() }));
vi.mock("../check-in/checkIn.api", () => ({ buscarReservaParaCheckIn: vi.fn() }));
vi.mock("../reservas/reservas.api", () => ({ listarReservas: vi.fn(), listarLlegadasPendientes: vi.fn() }));
vi.mock("../habitaciones/habitaciones.api", () => ({
  listarHabitaciones: vi.fn(),
  listarOrdenesMantenimiento: vi.fn(),
}));
vi.mock("../articulos/articulos.api", () => ({ listarArticulos: vi.fn() }));
vi.mock("../proveedores/proveedores.api", () => ({ listarProveedores: vi.fn() }));

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
  listarDepositos.mockResolvedValue([]);
  listarHabilitaciones.mockResolvedValue([]);
  listarMovimientos.mockResolvedValue([]);
  consultarStock.mockResolvedValue([]);
  buscarReservaParaCheckIn.mockRejectedValue({ response: { status: 404 } });
  listarReservas.mockResolvedValue([]);
  listarLlegadasPendientes.mockResolvedValue([]);
  listarHabitaciones.mockResolvedValue([]);
  listarOrdenesMantenimiento.mockResolvedValue([]);
  listarArticulos.mockResolvedValue({ items: [], total: 0 });
  listarProveedores.mockResolvedValue({ total: 0 });
});

describe("DashboardPage — despacho por rol", () => {
  it("admin ve su propio Inicio (AdminInicio), no el panel genérico de Stock/Compras", async () => {
    useSesion.mockReturnValue({ rol: "admin", rolInfo: { label: "Administrador" }, usuario: "gimena" });
    renderDashboard();

    expect(await screen.findByText("Reservas activas")).toBeInTheDocument();
    expect(screen.queryByText("Panel del rol")).not.toBeInTheDocument();
    expect(screen.queryByText("Llegadas de hoy")).not.toBeInTheDocument();
  });

  it("recepcionista sigue viendo su Inicio de siempre, sin cambios", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", rolInfo: { label: "Recepcionista" }, usuario: "Fer" });
    renderDashboard();

    expect(await screen.findByText(/Llegadas de hoy/)).toBeInTheDocument();
    expect(screen.queryByText("Reservas activas")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel del rol")).not.toBeInTheDocument();
  });

  it("depósito sigue con el panel genérico de Stock/Compras, sin cambios", async () => {
    useSesion.mockReturnValue({ rol: "deposito", rolInfo: { label: "Encargado de Depósito", descripcion: "" }, usuario: "Tom" });
    renderDashboard();

    expect(await screen.findByText("Panel del rol")).toBeInTheDocument();
    expect(screen.getByText("Movimientos hoy")).toBeInTheDocument();
    expect(screen.queryByText("Reservas activas")).not.toBeInTheDocument();
  });

  it("compras sigue con el panel genérico de Stock/Compras, sin cambios", async () => {
    useSesion.mockReturnValue({ rol: "compras", rolInfo: { label: "Encargado de Compras", descripcion: "" }, usuario: "Rita" });
    renderDashboard();

    expect(await screen.findByText("Panel del rol")).toBeInTheDocument();
    expect(screen.getByText("Sin parámetros")).toBeInTheDocument();
    expect(screen.queryByText("Reservas activas")).not.toBeInTheDocument();
  });

  it("gerente sigue con el panel genérico de Stock/Compras, sin cambios", async () => {
    useSesion.mockReturnValue({ rol: "gerente", rolInfo: { label: "Gerente", descripcion: "" }, usuario: "Lucas" });
    renderDashboard();

    expect(await screen.findByText("Panel del rol")).toBeInTheDocument();
    expect(screen.getByText("Consumo del mes")).toBeInTheDocument();
    expect(screen.queryByText("Reservas activas")).not.toBeInTheDocument();
  });

  it("housekeeping ve su propio Inicio (HousekeepingInicio), no el panel genérico de Stock/Compras", async () => {
    useSesion.mockReturnValue({ rol: "housekeeping", rolInfo: { label: "Housekeeping" }, usuario: "Coco" });
    renderDashboard();

    expect(await screen.findByText(/Para limpiar ahora/)).toBeInTheDocument();
    expect(screen.queryByText("Panel del rol")).not.toBeInTheDocument();
    expect(screen.queryByText("Reservas activas")).not.toBeInTheDocument();
    expect(screen.queryByText("Llegadas de hoy")).not.toBeInTheDocument();
  });
});
