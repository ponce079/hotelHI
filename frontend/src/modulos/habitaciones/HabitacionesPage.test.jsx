import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { HabitacionesPage } from "./HabitacionesPage";
import { useSesion } from "../../lib/sesion";
import { listarHabitaciones, actualizarEstadoHabitacion } from "./habitaciones.api";

// vi.fn() (no un objeto fijo) para poder pisar rol/puede por test — hace
// falta simular distintos roles, no solo el "admin: puede todo" original.
vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));

// vi.mock(...) se "hoistea" arriba de todo el archivo, así que la fixture
// que usa adentro tiene que declararse con vi.hoisted (si no, referenciarla
// dentro del factory tira "Cannot access before initialization").
const { HABITACION_LIBRE, HABITACION_EN_LIMPIEZA } = vi.hoisted(() => ({
  HABITACION_LIBRE: {
    id: 55,
    numero: "55",
    tipo: "Simple",
    tipoHabitacionId: 1,
    capacidad: 1,
    piso: 0,
    equipamiento: null,
    estado: "libre",
    tarifaPorNoche: "20000",
    activo: true,
    motivoBloqueo: null,
  },
  HABITACION_EN_LIMPIEZA: {
    id: 23,
    numero: "23",
    tipo: "Simple",
    tipoHabitacionId: 1,
    capacidad: 1,
    piso: 0,
    equipamiento: null,
    estado: "en limpieza",
    tarifaPorNoche: "20000",
    activo: true,
    motivoBloqueo: null,
  },
}));

vi.mock("./habitaciones.api", () => ({
  listarHabitaciones: vi.fn(),
  listarOrdenesMantenimiento: vi.fn().mockResolvedValue([]),
  actualizarEstadoHabitacion: vi.fn(),
}));

// HU-89: el filtro de tipo ahora sale del catálogo (tipos-habitacion), no
// de habitaciones.api.js.
vi.mock("../tipos-habitacion/tiposHabitacion.api", () => ({
  listarTiposHabitacion: vi.fn().mockResolvedValue([{ id: 1, codigo: "SIMPLE", nombre: "Simple", activo: true }]),
}));

vi.mock("../reservas/reservas.api", () => ({
  listarReservas: vi.fn().mockResolvedValue([]),
}));

// Ruta stub: no monta HabitacionDetallePage real (eso lo cubre su propio
// test file) — solo confirma a qué :id navegó el click de la tarjeta.
function DetalleStub() {
  const { id } = useParams();
  return <p>Detalle de la habitación {id}</p>;
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/habitaciones"]}>
        <Routes>
          <Route path="/habitaciones" element={<HabitacionesPage />} />
          <Route path="/habitaciones/:id" element={<DetalleStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useSesion.mockReturnValue({ rol: "admin", puede: () => true });
  listarHabitaciones.mockResolvedValue([HABITACION_LIBRE]);
  actualizarEstadoHabitacion.mockResolvedValue({ ...HABITACION_EN_LIMPIEZA, estado: "libre" });
});

describe("HabitacionesPage — tarjeta clickeable", () => {
  it("navega a /habitaciones/:id al hacer click en la tarjeta de una habitación", async () => {
    const usuario = userEvent.setup();
    renderPanel();

    const tarjeta = await screen.findByRole("button", { name: /55/ });
    await usuario.click(tarjeta);

    expect(await screen.findByText(`Detalle de la habitación ${HABITACION_LIBRE.id}`)).toBeInTheDocument();
  });

  it('el link "Iniciar check-in" no navega al detalle (stopPropagation)', async () => {
    const usuario = userEvent.setup();
    renderPanel();

    const link = await screen.findByRole("link", { name: /Iniciar check-in/ });
    await usuario.click(link);

    expect(screen.queryByText(/Detalle de la habitación/)).not.toBeInTheDocument();
  });

  it('el botón "Más acciones" (⋮) abre el menú y no navega al detalle', async () => {
    const usuario = userEvent.setup();
    renderPanel();

    const menu = await screen.findByRole("button", { name: /Más acciones/ });
    await usuario.click(menu);

    expect(await screen.findByRole("button", { name: "Cambiar estado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument();
    expect(screen.queryByText(/Detalle de la habitación/)).not.toBeInTheDocument();
  });
});

// Reparto de atajos por rol en la tarjeta (corrección: el atajo de check-in
// no cruzaba con el rol, se mostraba para cualquiera que viera el Panel).
function puedeComoRol(rol) {
  return (accion) => {
    if (accion === "verHabitaciones") return ["admin", "recepcionista", "housekeeping"].includes(rol);
    if (accion === "gestionarCheckIn") return rol === "admin" || rol === "recepcionista";
    if (accion === "registrarConsumoServicio") return rol === "admin" || rol === "recepcionista";
    if (accion === "iniciarCheckInDesdePanel") return rol === "recepcionista";
    if (accion === "marcarHabitacionLimpia") return rol === "housekeeping";
    return false;
  };
}

describe("HabitacionesPage — atajo de check-in en una tarjeta libre, por rol", () => {
  it("Recepcionista sí ve \"Iniciar check-in\"", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", puede: puedeComoRol("recepcionista") });
    renderPanel();

    expect(await screen.findByRole("link", { name: /Iniciar check-in/ })).toBeInTheDocument();
  });

  it("Housekeeping NO ve \"Iniciar check-in\" en una tarjeta libre", async () => {
    useSesion.mockReturnValue({ rol: "housekeeping", puede: puedeComoRol("housekeeping") });
    renderPanel();

    await screen.findByText("55"); // espera a que la tarjeta termine de cargar
    expect(screen.queryByRole("link", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
  });
});

describe('HabitacionesPage — atajo "Marcar como limpia" en una tarjeta en limpieza, por rol', () => {
  it("Housekeeping ve \"Marcar como limpia\" y al usarlo llama a actualizarEstadoHabitacion(id, \"libre\")", async () => {
    useSesion.mockReturnValue({ rol: "housekeeping", puede: puedeComoRol("housekeeping") });
    listarHabitaciones.mockResolvedValue([HABITACION_EN_LIMPIEZA]);
    const usuario = userEvent.setup();
    renderPanel();

    // Nombre exacto (no regex): la tarjeta entera también tiene role="button"
    // y su nombre accesible incluye todo el texto descendiente, así que una
    // regex acá matchea tanto la tarjeta como el botón real ("Found multiple
    // elements").
    const boton = await screen.findByRole("button", { name: "→ Marcar como limpia" });
    await usuario.click(boton);

    expect(actualizarEstadoHabitacion).toHaveBeenCalledWith(HABITACION_EN_LIMPIEZA.id, "libre");
  });

  it("Recepcionista NO ve \"Marcar como limpia\"", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", puede: puedeComoRol("recepcionista") });
    listarHabitaciones.mockResolvedValue([HABITACION_EN_LIMPIEZA]);
    renderPanel();

    await screen.findByText("23");
    expect(screen.queryByRole("button", { name: /Marcar como limpia/ })).not.toBeInTheDocument();
  });

  it("Admin tampoco ve ningún atajo en la tarjeta (ni check-in ni marcar como limpia)", async () => {
    useSesion.mockReturnValue({ rol: "admin", puede: puedeComoRol("admin") });
    listarHabitaciones.mockResolvedValue([HABITACION_LIBRE, HABITACION_EN_LIMPIEZA]);
    renderPanel();

    await screen.findByText("55");
    expect(screen.queryByRole("link", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Marcar como limpia/ })).not.toBeInTheDocument();
  });
});
