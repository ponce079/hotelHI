import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { HabitacionesPage } from "./HabitacionesPage";

vi.mock("../../lib/sesion", () => ({
  useSesion: () => ({ rol: "admin", puede: () => true }),
}));

// vi.mock(...) se "hoistea" arriba de todo el archivo, así que la fixture
// que usa adentro tiene que declararse con vi.hoisted (si no, referenciarla
// dentro del factory tira "Cannot access before initialization").
const { HABITACION_LIBRE } = vi.hoisted(() => ({
  HABITACION_LIBRE: {
    id: 55,
    numero: "55",
    tipo: "Simple",
    capacidad: 1,
    piso: 0,
    equipamiento: null,
    estado: "libre",
    tarifaPorNoche: "20000",
    activo: true,
    motivoBloqueo: null,
  },
}));

vi.mock("./habitaciones.api", () => ({
  listarHabitaciones: vi.fn().mockResolvedValue([HABITACION_LIBRE]),
  listarOrdenesMantenimiento: vi.fn().mockResolvedValue([]),
  listarTiposHabitacion: vi.fn().mockResolvedValue(["Simple"]),
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
