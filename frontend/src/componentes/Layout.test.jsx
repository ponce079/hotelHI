import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

const cerrarSesion = vi.fn();

function sesion(extra = {}) {
  return {
    rol: "housekeeping",
    usuario: "housekeeping.demo",
    rolInfo: { label: "Housekeeping" },
    cerrarSesion,
    puede: () => true,
    ...extra,
  };
}

beforeEach(() => {
  localStorage.clear();
  cerrarSesion.mockClear();
  listarOrdenesMantenimiento.mockResolvedValue([]);
  useSesion.mockReturnValue(sesion());
});

function UbicacionActual() {
  const { pathname, search } = useLocation();
  return <div data-testid="ubicacion">{pathname + search}</div>;
}

function renderLayout({ ruta = "/", queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }) } = {}) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="*" element={<UbicacionActual />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe("Layout — badge de pendientes en \"Mantenimiento\"", () => {
  it("muestra el conteo real de órdenes Pendientes", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([ordenPendiente(1), ordenPendiente(2), { id: 3, estado: "Resuelta" }]);
    renderLayout();

    const link = await screen.findByRole("link", { name: /Mantenimiento/ });
    await waitFor(() => expect(link).toHaveTextContent("2"));
  });

  it("no muestra ningún badge cuando no hay pendientes", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([{ id: 3, estado: "Resuelta" }]);
    renderLayout();

    const link = await screen.findByRole("link", { name: "Mantenimiento" });
    expect(link).not.toHaveTextContent(/\d/);
  });

  it("se actualiza al invalidar \"ordenes-mantenimiento\" (mismo mecanismo que usan Historial y el Detalle de Habitación al resolver una orden)", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([ordenPendiente(1), ordenPendiente(2)]);
    const { queryClient } = renderLayout();

    const link = await screen.findByRole("link", { name: /Mantenimiento/ });
    await waitFor(() => expect(link).toHaveTextContent("2"));

    listarOrdenesMantenimiento.mockResolvedValue([]);
    await queryClient.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });

    await waitFor(() => expect(link).not.toHaveTextContent(/\d/));
  });
});

describe("Layout — menú por rol (HU-71)", () => {
  it("housekeeping ve solo sus grupos e ítems", () => {
    renderLayout();
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(nav).getByRole("link", { name: "Estado de habitaciones" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Reservas" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: /Recepción/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: /Administración/ })).not.toBeInTheDocument();
  });

  it("el administrador ve todos los grupos", () => {
    useSesion.mockReturnValue(sesion({ rol: "admin", usuario: "admin", rolInfo: { label: "Administrador" } }));
    renderLayout();
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    const grupos = within(nav).getAllByRole("button").map((b) => b.textContent);
    expect(grupos).toEqual(["Recepción", "Caja y facturación", "Habitaciones", "Comercial", "Stock", "Compras", "Administración"]);
  });
});

describe("Layout — ítem activo y grupos", () => {
  beforeEach(() => {
    useSesion.mockReturnValue(sesion({ rol: "admin", usuario: "admin", rolInfo: { label: "Administrador" } }));
  });

  it("marca el ítem de la ruta con aria-current y abre su grupo aunque sea Administración", () => {
    renderLayout({ ruta: "/usuarios" });
    expect(screen.getByRole("link", { name: "Usuarios y roles" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Administración" })).toHaveAttribute("aria-expanded", "true");
  });

  it("Administración arranca cerrado y el resto abierto", () => {
    renderLayout({ ruta: "/reservas" });
    expect(screen.getByRole("button", { name: "Administración" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Usuarios y roles" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recepción" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Reservas" })).toHaveAttribute("aria-current", "page");
  });

  it("plegar un grupo se recuerda por usuario al volver a montar", async () => {
    const usuario = userEvent.setup();
    const primera = renderLayout({ ruta: "/reservas" });
    await usuario.click(screen.getByRole("button", { name: "Comercial" }));
    expect(screen.queryByRole("link", { name: "Tarifas" })).not.toBeInTheDocument();
    primera.unmount();

    renderLayout({ ruta: "/reservas" });
    expect(screen.getByRole("button", { name: "Comercial" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Tarifas" })).not.toBeInTheDocument();
  });

  it("contraer el menú se recuerda y deja el nombre como tooltip", async () => {
    const usuario = userEvent.setup();
    const primera = renderLayout({ ruta: "/reservas" });
    await usuario.click(screen.getByRole("button", { name: "Contraer menú" }));
    expect(screen.getByRole("link", { name: "Check-in" })).toHaveAttribute("title", "Check-in");
    primera.unmount();

    renderLayout({ ruta: "/reservas" });
    expect(screen.getByRole("button", { name: "Expandir menú" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check-in" })).toHaveAttribute("title", "Check-in");
  });

  it("sin localStorage el menú funciona igual", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const usuario = userEvent.setup();
    renderLayout({ ruta: "/reservas" });
    await usuario.click(screen.getByRole("button", { name: "Contraer menú" }));
    expect(screen.getByRole("button", { name: "Expandir menú" })).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

// Usuarios y Seguridad: la tarjeta del usuario abre el menú de cuenta con "Mi perfil" (página, no modal).
describe("Layout — tarjeta de usuario y menú de cuenta", () => {
  beforeEach(() => {
    useSesion.mockReturnValue(
      sesion({
        usuario: "ana.hk",
        perfil: { nombre: "Ana", apellido: "Pérez", usuario: "ana.hk", email: "ana@hotel.test" },
      })
    );
  });

  it("muestra iniciales, nombre y rol, y abre un menú con nombre, email, rol, Mi perfil y Cerrar sesión", async () => {
    const usuario = userEvent.setup();
    renderLayout();

    const tarjeta = screen.getByRole("button", { name: /Ana Pérez/ });
    expect(tarjeta).toHaveTextContent("AP");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await usuario.click(tarjeta);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(menu).getByText("ana@hotel.test")).toBeInTheDocument();
    expect(within(menu).getByText("Housekeeping")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Mi perfil" })).toHaveAttribute("href", "/mi-perfil");
    expect(within(menu).queryByText(/Cambiar contraseña/)).not.toBeInTheDocument();
  });

  it("se cierra con Escape y con click afuera", async () => {
    const usuario = userEvent.setup();
    renderLayout();
    const tarjeta = screen.getByRole("button", { name: /Ana Pérez/ });

    await usuario.click(tarjeta);
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await usuario.click(tarjeta);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await usuario.click(screen.getByTestId("ubicacion"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("\"Cerrar sesión\" cierra la sesión", async () => {
    const usuario = userEvent.setup();
    renderLayout();
    await usuario.click(screen.getByRole("button", { name: /Ana Pérez/ }));
    await usuario.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
  });
});

describe("Layout — barra superior", () => {
  it("muestra la miga de pan y la fecha de hoy sin la palabra \"operativa\"", () => {
    renderLayout({ ruta: "/habitaciones" });
    const miga = screen.getByRole("navigation", { name: "Miga de pan" });
    expect(miga).toHaveTextContent("Habitaciones/Estado de habitaciones");
    expect(screen.getByText(/^Hoy · [a-záéíóú]{3} \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument();
    expect(screen.queryByText(/operativa/i)).not.toBeInTheDocument();
  });

  it("el buscador lleva a /reservas?q= con Enter", async () => {
    const usuario = userEvent.setup();
    renderLayout({ ruta: "/habitaciones" });
    await usuario.type(screen.getByRole("searchbox", { name: /Buscar reserva/ }), "Pérez 401{Enter}");
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/reservas?q=P%C3%A9rez%20401");
  });

  it("sin permiso para ver reservas no hay buscador", () => {
    useSesion.mockReturnValue(sesion({ puede: (accion) => accion !== "verReservas" }));
    renderLayout();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("el panel lateral se abre con la hamburguesa y se cierra con Escape", async () => {
    const usuario = userEvent.setup();
    renderLayout();
    const hamburguesa = screen.getByRole("button", { name: "Abrir menú" });
    await usuario.click(hamburguesa);
    expect(hamburguesa).toHaveAttribute("aria-expanded", "true");
    await usuario.keyboard("{Escape}");
    expect(hamburguesa).toHaveAttribute("aria-expanded", "false");
  });
});
