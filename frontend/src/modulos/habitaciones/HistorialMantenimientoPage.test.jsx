import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { HistorialMantenimientoPage } from "./HistorialMantenimientoPage";
import { useSesion } from "../../lib/sesion";
import { listarOrdenesMantenimiento, resolverOrdenMantenimiento } from "./habitaciones.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));

vi.mock("./habitaciones.api", () => ({
  listarOrdenesMantenimiento: vi.fn(),
  resolverOrdenMantenimiento: vi.fn(),
}));

// 4 órdenes que cubren las 4 combinaciones (Pendiente/Resuelta x
// Urgente/Normal) — fechas todas distintas para poder distinguir el
// desempate cronológico del criterio de estado/urgencia.
const ORDEN_PENDIENTE_NORMAL = {
  id: 1,
  fecha: "2026-09-10T10:00:00Z",
  habitacionId: 55,
  habitacion: { id: 55, numero: "55" },
  tipoTarea: "Preventivo",
  responsable: "Housekeeping",
  urgente: false,
  estado: "Pendiente",
};
const ORDEN_PENDIENTE_URGENTE = {
  id: 2,
  fecha: "2026-09-11T10:00:00Z",
  habitacionId: 23,
  habitacion: { id: 23, numero: "23" },
  tipoTarea: "Correctivo",
  responsable: "Housekeeping",
  urgente: true,
  estado: "Pendiente",
};
const ORDEN_RESUELTA_NORMAL = {
  id: 3,
  fecha: "2026-09-12T10:00:00Z",
  habitacionId: 101,
  habitacion: { id: 101, numero: "101" },
  tipoTarea: "Preventivo",
  responsable: "Housekeeping",
  urgente: false,
  estado: "Resuelta",
  resueltaPor: "ana",
};
const ORDEN_RESUELTA_URGENTE = {
  id: 4,
  // La más nueva de las 4: si el orden por defecto fuera solo cronológico,
  // esta terminaría primera — el test de orden por defecto depende de que
  // NO sea así.
  fecha: "2026-09-13T10:00:00Z",
  habitacionId: 301,
  habitacion: { id: 301, numero: "301" },
  tipoTarea: "Correctivo",
  responsable: "Housekeeping",
  urgente: true,
  estado: "Resuelta",
  resueltaPor: "ana",
};

const TODAS = [ORDEN_PENDIENTE_NORMAL, ORDEN_PENDIENTE_URGENTE, ORDEN_RESUELTA_NORMAL, ORDEN_RESUELTA_URGENTE];

function DetalleStub() {
  const { id } = useParams();
  return <p>Detalle de la habitación {id}</p>;
}

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/historial-mantenimiento"]}>
        <Routes>
          <Route path="/historial-mantenimiento" element={<HistorialMantenimientoPage />} />
          <Route path="/habitaciones/:id" element={<DetalleStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useSesion.mockReturnValue({ rol: "housekeeping", usuario: "housekeeping.demo", puede: () => true });
  listarOrdenesMantenimiento.mockResolvedValue(TODAS);
  resolverOrdenMantenimiento.mockResolvedValue({ ...ORDEN_PENDIENTE_NORMAL, estado: "Resuelta" });
});

describe("HistorialMantenimientoPage — fila clickeable", () => {
  it("el click en una fila navega al Detalle de la habitación de esa orden", async () => {
    const usuario = userEvent.setup();
    renderPagina();

    const celda = await screen.findByText("55");
    await usuario.click(celda);

    expect(await screen.findByText(`Detalle de la habitación ${ORDEN_PENDIENTE_NORMAL.habitacion.id}`)).toBeInTheDocument();
  });
});

describe("HistorialMantenimientoPage — botón inline \"Marcar como resuelta\"", () => {
  it("Housekeeping lo ve, y al usarlo resuelve la orden SIN navegar (stopPropagation)", async () => {
    useSesion.mockReturnValue({
      rol: "housekeeping",
      usuario: "housekeeping.demo",
      puede: (accion) => accion === "verHabitaciones" || accion === "resolverMantenimiento",
    });
    const usuario = userEvent.setup();
    renderPagina();

    const fila = (await screen.findByText("55")).closest("tr");
    const boton = within(fila).getByRole("button", { name: "Marcar como resuelta" });
    await usuario.click(boton);

    // Abre el ConfirmDialog en vez de resolver directo — confirmación
    // simple (Cancelar/Confirmar), sin pedir un nombre a mano: esta
    // pantalla ya sabe quién opera por la sesión activa.
    expect(await screen.findByText("¿Confirmás que el problema en la habitación 55 fue resuelto?")).toBeInTheDocument();
    expect(screen.queryByText(/Detalle de la habitación/)).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(resolverOrdenMantenimiento).toHaveBeenCalledWith(ORDEN_PENDIENTE_NORMAL.id, "housekeeping.demo");
    expect(screen.queryByText(/Detalle de la habitación/)).not.toBeInTheDocument();
  });

  it("Recepcionista NO ve el botón en ninguna fila pendiente, ni la columna ACCIONES", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", usuario: "recepcion.demo", puede: (accion) => accion === "verHabitaciones" });
    renderPagina();

    await screen.findByText("55");
    expect(screen.queryByRole("button", { name: "Marcar como resuelta" })).not.toBeInTheDocument();
    // No solo el botón: la columna entera (antes quedaba con el header
    // "Acciones" pero todas las celdas vacías para quien no puede resolver).
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
  });

  it("Admin (solo lectura acá, igual que Recepcionista) tampoco ve el botón ni la columna ACCIONES", async () => {
    useSesion.mockReturnValue({ rol: "admin", usuario: "admin.demo", puede: (accion) => accion === "verHabitaciones" });
    renderPagina();

    await screen.findByText("55");
    expect(screen.queryByRole("button", { name: "Marcar como resuelta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
  });
});

describe("HistorialMantenimientoPage — chips de filtro", () => {
  it('muestra el conteo real de cada chip: "4 Todos", "2 Pendientes", "2 Urgentes", "2 Resueltas"', async () => {
    renderPagina();

    expect(await screen.findByRole("button", { name: "4 Todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Pendientes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Urgentes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Resueltas" })).toBeInTheDocument();
  });

  it('click en "Pendientes" filtra a solo las 2 órdenes pendientes (toggle: un segundo click lo saca)', async () => {
    const usuario = userEvent.setup();
    renderPagina();

    const chip = await screen.findByRole("button", { name: "2 Pendientes" });
    await usuario.click(chip);

    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.queryByText("101")).not.toBeInTheDocument();
    expect(screen.queryByText("301")).not.toBeInTheDocument();

    await usuario.click(chip);
    expect(await screen.findByText("101")).toBeInTheDocument();
  });

  it('"Pendientes" + "Urgentes" combinados dejan solo la orden pendiente y urgente', async () => {
    const usuario = userEvent.setup();
    renderPagina();

    await usuario.click(await screen.findByRole("button", { name: "2 Pendientes" }));
    await usuario.click(screen.getByRole("button", { name: "2 Urgentes" }));

    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.queryByText("55")).not.toBeInTheDocument();
    expect(screen.queryByText("101")).not.toBeInTheDocument();
    expect(screen.queryByText("301")).not.toBeInTheDocument();
  });

  it('"Todos" limpia cualquier filtro activo (Pendientes + Urgentes) y vuelve a mostrar las 4 órdenes', async () => {
    const usuario = userEvent.setup();
    renderPagina();

    await usuario.click(await screen.findByRole("button", { name: "2 Pendientes" }));
    await usuario.click(screen.getByRole("button", { name: "2 Urgentes" }));
    expect(screen.queryByText("55")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "4 Todos" }));

    expect(await screen.findByText("55")).toBeInTheDocument();
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("301")).toBeInTheDocument();
  });
});

describe("HistorialMantenimientoPage — orden por defecto", () => {
  it("sin filtro: Pendiente-Urgente arriba de todo, después Pendiente-Normal, después las Resueltas", async () => {
    renderPagina();

    await screen.findByText("55");
    const numerosDeHabitacion = screen.getAllByRole("row").slice(1).map((fila) => within(fila).getAllByRole("cell")[1].textContent);

    // La orden Resuelta-Urgente (301) es la más NUEVA de las 4 por fecha —
    // si el orden fuera solo cronológico terminaría primera. El criterio
    // pedido la manda al final igual, porque "Resuelta" va siempre después
    // de "Pendiente" sin importar la urgencia.
    expect(numerosDeHabitacion).toEqual(["23", "55", "301", "101"]);
  });
});
