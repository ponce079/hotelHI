import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DisponibilidadPublicaPage } from "./DisponibilidadPublicaPage";
import { consultarDisponibilidad } from "./reservas.api";

vi.mock("./reservas.api", () => ({ consultarDisponibilidad: vi.fn() }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const HABITACION_101 = {
  id: 1,
  numero: "101",
  tipo: "Doble",
  capacidad: 2,
  piso: 1,
  equipamiento: null,
  tarifaPorNoche: 50000,
  totalEstadia: 150000,
};
const HABITACION_204 = {
  id: 2,
  numero: "204",
  tipo: "Doble",
  capacidad: 2,
  piso: 2,
  equipamiento: null,
  tarifaPorNoche: 60000,
  totalEstadia: 180000,
};

const DISPONIBILIDAD = {
  noches: 3,
  habitaciones: [HABITACION_101, HABITACION_204],
  resumenPorTipo: [{ tipo: "Doble", total: 2, disponibles: 2, tarifaDesde: 50000, capacidadMaxima: 2 }],
};

function renderPagina(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DisponibilidadPublicaPage {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function buscar() {
  fireEvent.change(screen.getByLabelText("Entrada"), { target: { value: "2026-10-10" } });
  fireEvent.change(screen.getByLabelText("Salida"), { target: { value: "2026-10-13" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await screen.findByText("101");
}

beforeEach(() => {
  vi.clearAllMocks();
  consultarDisponibilidad.mockResolvedValue(DISPONIBILIDAD);
});

describe("DisponibilidadPublicaPage — modoInterno (mostrador): tarjetas seleccionables", () => {
  it("elige 2 habitaciones y el botón refleja la cantidad; confirmar manda todo al wizard de Nueva reserva", async () => {
    renderPagina({ modoInterno: true });
    await buscar();

    const boton = () => screen.getByRole("button", { name: /Crear reserva/ });
    expect(boton()).toBeDisabled();
    expect(boton()).toHaveTextContent("Crear reserva");

    fireEvent.click(screen.getByText("101").closest("button"));
    expect(boton()).toBeEnabled();
    expect(boton()).toHaveTextContent("Crear reserva (1 habitación)");

    fireEvent.click(screen.getByText("204").closest("button"));
    expect(boton()).toHaveTextContent("Crear reserva (2 habitaciones)");

    fireEvent.click(boton());

    expect(mockNavigate).toHaveBeenCalledWith(
      "/reservas?nueva=1&desde=2026-10-10&hasta=2026-10-13",
      { state: { habitacionIds: [1, 2] } }
    );
  });

  it("deseleccionar una tarjeta ya elegida la saca de la cuenta", async () => {
    renderPagina({ modoInterno: true });
    await buscar();

    const tarjeta101 = () => screen.getByText("101").closest("button");
    fireEvent.click(tarjeta101());
    expect(screen.getByRole("button", { name: /Crear reserva/ })).toHaveTextContent("(1 habitación)");

    fireEvent.click(tarjeta101());
    expect(screen.getByRole("button", { name: /Crear reserva/ })).toHaveTextContent("Crear reserva");
    expect(screen.getByRole("button", { name: "Crear reserva" })).toBeDisabled();
  });

  it("una búsqueda nueva limpia la selección anterior", async () => {
    renderPagina({ modoInterno: true });
    await buscar();

    fireEvent.click(screen.getByText("101").closest("button"));
    expect(screen.getByRole("button", { name: /Crear reserva/ })).toHaveTextContent("(1 habitación)");

    fireEvent.change(screen.getByLabelText("Salida"), { target: { value: "2026-10-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(consultarDisponibilidad).toHaveBeenCalledTimes(2));
    await screen.findByText("101");

    expect(screen.getByRole("button", { name: "Crear reserva" })).toBeDisabled();
  });
});

describe("DisponibilidadPublicaPage — autoservicio público: sin selección, comportamiento de siempre", () => {
  it("las tarjetas no son seleccionables y 'Reservar estas fechas' no manda habitaciones", async () => {
    renderPagina({ modoInterno: false });
    await buscar();

    const tarjeta101 = screen.getByText("101").closest("button");
    fireEvent.click(tarjeta101);
    // Sin seña ni cuenta: el click en la tarjeta no hace nada visible.
    expect(screen.queryByRole("button", { name: /Crear reserva/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reservar estas fechas" }));
    expect(mockNavigate).toHaveBeenCalledWith("/reservar?desde=2026-10-10&hasta=2026-10-13");
  });
});
