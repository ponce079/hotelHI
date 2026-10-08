import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "./Layout";
import { useSesion } from "../lib/sesion";
import { listarOrdenesMantenimiento } from "../modulos/habitaciones/habitaciones.api";

vi.mock("../lib/sesion", () => ({ useSesion: vi.fn() }));

vi.mock("../modulos/habitaciones/habitaciones.api", () => ({
  listarOrdenesMantenimiento: vi.fn(),
}));

function ordenPendiente(id) {
  return { id, estado: "Pendiente" };
}

beforeEach(() => {
  useSesion.mockReturnValue({
    rol: "housekeeping",
    usuario: "housekeeping.demo",
    rolInfo: { label: "Housekeeping" },
    cerrarSesion: vi.fn(),
    puede: () => true,
  });
});

function renderLayout(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe("Layout — badge de pendientes en \"Historial de Mantenimiento\"", () => {
  it("muestra el conteo real de órdenes Pendientes", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([ordenPendiente(1), ordenPendiente(2), { id: 3, estado: "Resuelta" }]);
    renderLayout();

    // findByRole resuelve apenas matchea el nombre accesible por regex, que
    // ya matchea ANTES de que la query termine de cargar (sin el badge
    // todavía) — hay que esperar con waitFor a que el conteo real aparezca,
    // no asumir que found === ya cargado.
    const link = await screen.findByRole("link", { name: /Historial de Mantenimiento/ });
    await waitFor(() => expect(link).toHaveTextContent("2"));
  });

  it("no muestra ningún badge cuando no hay pendientes", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([{ id: 3, estado: "Resuelta" }]);
    renderLayout();

    const link = await screen.findByRole("link", { name: "Historial de Mantenimiento" });
    expect(link).not.toHaveTextContent(/\d/);
  });

  it("se actualiza al invalidar \"ordenes-mantenimiento\" (mismo mecanismo que usan Historial y el Detalle de Habitación al resolver una orden)", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([ordenPendiente(1), ordenPendiente(2)]);
    const { queryClient } = renderLayout();

    const link = await screen.findByRole("link", { name: /Historial de Mantenimiento/ });
    await waitFor(() => expect(link).toHaveTextContent("2"));

    listarOrdenesMantenimiento.mockResolvedValue([]);
    await queryClient.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });

    await waitFor(() => expect(link).not.toHaveTextContent(/\d/));
  });
});

// Usuarios y Seguridad: la tarjeta del usuario lleva a la página "Mi perfil"
// (ya no abre un modal).
describe("Layout — tarjeta del usuario", () => {
  it("es un link a /mi-perfil con el nombre y apellido del perfil", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([]);
    useSesion.mockReturnValue({
      rol: "housekeeping",
      usuario: "ana.hk",
      perfil: { nombre: "Ana", apellido: "Pérez", usuario: "ana.hk" },
      rolInfo: { label: "Housekeeping" },
      cerrarSesion: vi.fn(),
      puede: () => true,
    });
    renderLayout();

    const tarjeta = screen.getByRole("link", { name: /Ana Pérez/ });
    expect(tarjeta).toHaveAttribute("href", "/mi-perfil");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
