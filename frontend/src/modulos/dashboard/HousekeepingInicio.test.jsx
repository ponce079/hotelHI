import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HousekeepingInicio } from "./HousekeepingInicio";
import { useSesion } from "../../lib/sesion";
import {
  listarHabitaciones,
  listarOrdenesMantenimiento,
  actualizarEstadoHabitacion,
  resolverOrdenMantenimiento,
} from "../habitaciones/habitaciones.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("../habitaciones/habitaciones.api", () => ({
  listarHabitaciones: vi.fn(),
  listarOrdenesMantenimiento: vi.fn(),
  actualizarEstadoHabitacion: vi.fn(),
  resolverOrdenMantenimiento: vi.fn(),
}));

const HABITACIONES = [
  { id: 1, numero: "030", tipo: "Doble", piso: 0, estado: "en limpieza" },
  { id: 2, numero: "050", tipo: "Simple", piso: 0, estado: "en limpieza" },
  { id: 3, numero: "101", tipo: "Simple", piso: 1, estado: "en limpieza" },
  { id: 4, numero: "102", tipo: "Simple", piso: 1, estado: "libre" },
  { id: 5, numero: "201", tipo: "Doble", piso: 2, estado: "libre" },
  { id: 6, numero: "301", tipo: "Doble", piso: 3, estado: "ocupada" },
];

const ORDENES = [
  { id: 10, estado: "Pendiente", urgente: false, tipoTarea: "Preventivo", habitacion: { id: 4, numero: "204" } },
  { id: 11, estado: "Pendiente", urgente: true, tipoTarea: "Correctivo", habitacion: { id: 3, numero: "101" } },
  { id: 12, estado: "Resuelta", urgente: false, tipoTarea: "Pintura", habitacion: { id: 5, numero: "050" } },
];

function HistorialStub() {
  return <p>Historial de Mantenimiento completo</p>;
}

function renderInicio() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HousekeepingInicio />} />
          <Route path="/habitaciones" element={<p>Panel de Habitaciones</p>} />
          <Route path="/historial-mantenimiento" element={<HistorialStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue({ rol: "housekeeping", rolInfo: { label: "Housekeeping" }, usuario: "Coco" });
  listarHabitaciones.mockResolvedValue(HABITACIONES);
  listarOrdenesMantenimiento.mockResolvedValue(ORDENES);
  actualizarEstadoHabitacion.mockResolvedValue({ id: 1, numero: "030", estado: "libre" });
  resolverOrdenMantenimiento.mockResolvedValue({});
});

describe("HousekeepingInicio — pulso", () => {
  it("muestra los 3 totales reales: en limpieza, libres y mantenimiento pendiente con desglose de urgentes", async () => {
    renderInicio();
    await screen.findByText("Hab. 030 · Doble"); // espera a que resuelvan las queries

    expect(screen.getByRole("button", { name: /Para limpiar ahora/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Habitaciones listas/ })).toHaveTextContent("2");
    const tarjetaMantenimiento = screen.getByRole("button", { name: /Mantenimiento pendiente/ });
    expect(tarjetaMantenimiento).toHaveTextContent("2");
    expect(tarjetaMantenimiento).toHaveTextContent("· 1 urgente");
  });

  it("no muestra el sufijo de urgentes cuando no hay ninguna orden urgente", async () => {
    listarOrdenesMantenimiento.mockResolvedValue(ORDENES.map((o) => ({ ...o, urgente: false })));
    renderInicio();
    await screen.findByText("Hab. 204");

    const tarjetaMantenimiento = screen.getByRole("button", { name: /Mantenimiento pendiente/ });
    expect(tarjetaMantenimiento).not.toHaveTextContent("urgente");
  });
});

describe("HousekeepingInicio — gráfico por piso", () => {
  it("muestra todos los pisos existentes, incluso los que tienen 0 pendientes de limpieza", async () => {
    renderInicio();
    await screen.findByText("Hab. 030 · Doble"); // espera a que resuelvan las queries
    const grafico = within(screen.getByText("Pendientes de limpieza por piso").closest("div"));

    expect(grafico.getByText("Piso 0")).toBeInTheDocument();
    expect(grafico.getByText("Piso 1")).toBeInTheDocument();
    // Piso 2 y 3 no tienen ninguna habitación "en limpieza", pero existen
    // habitaciones activas en esos pisos: la barra se muestra en 0, no se
    // oculta el piso completo.
    expect(grafico.getByText("Piso 2")).toBeInTheDocument();
    expect(grafico.getByText("Piso 3")).toBeInTheDocument();
  });
});

describe("HousekeepingInicio — habitaciones en limpieza", () => {
  it("lista una tarjeta por habitación en limpieza y permite marcarla como limpia", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    expect(await screen.findByText("Hab. 030 · Doble")).toBeInTheDocument();
    expect(screen.getByText("Hab. 101 · Simple")).toBeInTheDocument();

    const botones = screen.getAllByRole("button", { name: "→ Marcar como limpia" });
    await usuario.click(botones[0]);

    expect(actualizarEstadoHabitacion).toHaveBeenCalledWith(1, "libre");
  });

  it("sin habitaciones en limpieza muestra el estado vacío", async () => {
    listarHabitaciones.mockResolvedValue(HABITACIONES.map((h) => ({ ...h, estado: "libre" })));
    renderInicio();

    expect(await screen.findByText("No hay habitaciones pendientes de limpieza ahora.")).toBeInTheDocument();
  });
});

describe("HousekeepingInicio — mantenimiento pendiente", () => {
  it("muestra las pendientes con badge Urgente y resuelve con confirmación, igual que Historial de Mantenimiento", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    expect(await screen.findByText("Hab. 204")).toBeInTheDocument();
    expect(screen.getByText("Hab. 101")).toBeInTheDocument();
    expect(screen.queryByText("Hab. 050")).not.toBeInTheDocument(); // Resuelta, no debe listarse
    expect(screen.getByText("Urgente")).toBeInTheDocument();

    await usuario.click(screen.getAllByRole("button", { name: "Resolver →" })[0]);
    expect(await screen.findByText(/fue resuelto/)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(resolverOrdenMantenimiento).toHaveBeenCalledWith(10, "Coco");
  });

  it("sin mantenimiento pendiente muestra el estado vacío", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([]);
    renderInicio();

    expect(await screen.findByText("Sin órdenes de mantenimiento pendientes.")).toBeInTheDocument();
  });

  it('"Ver historial completo →" navega a Historial de Mantenimiento', async () => {
    const usuario = userEvent.setup();
    renderInicio();

    await usuario.click(await screen.findByRole("link", { name: /Ver historial completo/ }));
    expect(await screen.findByText("Historial de Mantenimiento completo")).toBeInTheDocument();
  });
});
