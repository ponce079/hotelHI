import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HabitacionDetallePage } from "./HabitacionDetallePage";
import { useSesion } from "../../lib/sesion";
import { obtenerHabitacion, resolverOrdenMantenimiento } from "./habitaciones.api";
import { listarReservas } from "../reservas/reservas.api";

// vi.fn() (no un objeto fijo) para poder pisar rol/puede por test — el
// bloque de "reparto de responsabilidad" más abajo necesita simular
// distintos roles, no solo el "admin: puede todo" que usan el resto de los
// tests de este archivo.
vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));

vi.mock("./habitaciones.api", () => ({
  obtenerHabitacion: vi.fn(),
  cambiarActivoHabitacion: vi.fn(),
  resolverOrdenMantenimiento: vi.fn(),
}));

vi.mock("../reservas/reservas.api", () => ({
  listarReservas: vi.fn(),
}));

// HU-89: HabitacionModal (abierta desde "Editar") pide el catálogo de tipos.
vi.mock("../tipos-habitacion/tiposHabitacion.api", () => ({
  listarTiposHabitacion: vi.fn().mockResolvedValue([{ id: 10, codigo: "DOBLE", nombre: "Doble", activo: true }]),
}));

const BASE = {
  id: 301,
  numero: "301",
  tipo: "Doble",
  tipoHabitacionId: 10,
  capacidad: 2,
  piso: 3,
  equipamiento: "Aire acondicionado, TV smart",
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

beforeEach(() => {
  useSesion.mockReturnValue({ rol: "admin", puede: () => true });
});

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

// Reparto de responsabilidad (corrección post rol "Personal de
// Mantenimiento"): Housekeeping y Recepcionista reportan, pero solo
// Housekeeping puede marcar una orden como resuelta. Replica acá el mismo
// criterio real de sesion.jsx en vez de un simple "puede: () => true", para
// probar el límite real, no una versión permisiva.
function puedeComoRol(rol) {
  return (accion) => {
    if (accion === "verHabitaciones") return ["admin", "recepcionista", "housekeeping"].includes(rol);
    if (accion === "gestionarMantenimiento") return rol === "housekeeping" || rol === "recepcionista";
    if (accion === "resolverMantenimiento") return rol === "housekeeping";
    return false;
  };
}

const ORDEN_PENDIENTE = {
  id: 9,
  fecha: "2026-09-20T12:00:00.000Z",
  tipoTarea: "Correctivo",
  responsable: "Equipo de Mantenimiento",
  urgente: true,
  estado: "Pendiente",
  resueltaEn: null,
  resueltaPor: null,
};

describe("HabitacionDetallePage — reparto de responsabilidad (resolver mantenimiento)", () => {
  it("Housekeeping ve y puede usar \"Marcar como resuelta\"", async () => {
    useSesion.mockReturnValue({ rol: "housekeeping", puede: puedeComoRol("housekeeping") });
    obtenerHabitacion.mockResolvedValue({ ...BASE, estado: "mantenimiento", ordenesMantenimiento: [ORDEN_PENDIENTE] });
    resolverOrdenMantenimiento.mockResolvedValue({ ...ORDEN_PENDIENTE, estado: "Resuelta" });

    const usuario = userEvent.setup();
    renderDetalle();

    const boton = await screen.findByRole("button", { name: "Marcar como resuelta" });
    await usuario.click(boton);
    await usuario.type(screen.getByPlaceholderText("Nombre de quien confirma la resolución"), "Ana");
    await usuario.click(screen.getByRole("button", { name: "Sí, marcar como resuelta" }));

    expect(resolverOrdenMantenimiento).toHaveBeenCalledWith(ORDEN_PENDIENTE.id, "Ana");
  });

  it("Recepcionista puede reportar (ve el botón de registrar) pero NO ve \"Marcar como resuelta\" ni la columna ACCIONES", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", puede: puedeComoRol("recepcionista") });
    obtenerHabitacion.mockResolvedValue({ ...BASE, estado: "mantenimiento", ordenesMantenimiento: [ORDEN_PENDIENTE] });

    renderDetalle();

    expect(await screen.findByText("Registrar mantenimiento")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar como resuelta" })).not.toBeInTheDocument();
    // No solo el botón: la columna entera (antes quedaba con el header
    // "Acciones" pero la celda vacía para quien no puede resolver).
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
  });
});
