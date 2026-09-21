import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { RecepcionistaInicio } from "./RecepcionistaInicio";
import { useSesion } from "../../lib/sesion";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";
import { listarHabitaciones, listarOrdenesMantenimiento } from "../habitaciones/habitaciones.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("../check-in/checkIn.api", () => ({ buscarReservaParaCheckIn: vi.fn() }));
vi.mock("../reservas/reservas.api", () => ({ listarReservas: vi.fn() }));
vi.mock("../habitaciones/habitaciones.api", () => ({
  listarHabitaciones: vi.fn(),
  listarOrdenesMantenimiento: vi.fn(),
}));

function mananaISO(hoy) {
  const fecha = new Date(`${hoy}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}

const hoy = hoyEnHoraLocal();
const maniana = mananaISO(hoy);

const RESERVA_LLEGA_HOY = {
  id: 10,
  codigoConfirmacion: "RS-HOY01",
  estado: ESTADO_RESERVA.CONFIRMADA,
  fechaDesde: `${hoy}T00:00:00.000Z`,
  fechaHasta: `${maniana}T00:00:00.000Z`,
  huesped: { nombre: "Marcos Beltrán" },
  habitaciones: [{ numero: "301", tipo: "Doble" }],
};
const RESERVA_LLEGA_MANIANA = {
  id: 11,
  codigoConfirmacion: "RS-MAN01",
  estado: ESTADO_RESERVA.CONFIRMADA,
  fechaDesde: `${maniana}T00:00:00.000Z`,
  fechaHasta: `${maniana}T00:00:00.000Z`,
  huesped: { nombre: "Julia Paz" },
  habitaciones: [{ numero: "205", tipo: "Simple" }],
};
const RESERVA_SALE_HOY = {
  id: 20,
  codigoConfirmacion: "RS-SALE01",
  estado: ESTADO_RESERVA.EN_CURSO,
  fechaDesde: `${hoy}T00:00:00.000Z`,
  fechaHasta: `${hoy}T00:00:00.000Z`,
  huesped: { nombre: "Laura Ríos" },
  habitaciones: [{ numero: "202", tipo: "Doble" }],
};
const RESERVA_SALE_MANIANA = {
  id: 21,
  codigoConfirmacion: "RS-SALE02",
  estado: ESTADO_RESERVA.EN_CURSO,
  fechaDesde: `${hoy}T00:00:00.000Z`,
  fechaHasta: `${maniana}T00:00:00.000Z`,
  huesped: { nombre: "Nadia Cruz" },
  habitaciones: [{ numero: "304", tipo: "Simple" }],
};

const HABITACIONES = [
  { id: 1, numero: "101", estado: "libre" },
  { id: 2, numero: "102", estado: "libre" },
  { id: 3, numero: "103", estado: "ocupada" },
  { id: 4, numero: "104", estado: "mantenimiento" },
  { id: 5, numero: "105", estado: "en limpieza" },
];

const ORDENES = [
  { id: 1, estado: "Pendiente", urgente: true, tipoTarea: "Aire acondicionado", habitacion: { numero: "23" } },
  { id: 2, estado: "Pendiente", urgente: false, tipoTarea: "Preventivo programado", habitacion: { numero: "101" } },
  { id: 3, estado: "Resuelta", urgente: false, tipoTarea: "Pintura", habitacion: { numero: "50" } },
];

function DetalleReservaStub() {
  const { id } = useParams();
  return <p>Detalle de la reserva {id}</p>;
}
function DetalleHabitacionStub() {
  const { id } = useParams();
  return <p>Detalle de la habitación {id}</p>;
}
function CheckInStub() {
  const [params] = useSearchParams();
  return <p>Check-in codigo={params.get("codigo") ?? ""}</p>;
}
function CheckOutReservaStub() {
  const { reservaId } = useParams();
  return <p>Check-out de la reserva {reservaId}</p>;
}
function HistorialMantenimientoStub() {
  return <p>Historial de Mantenimiento completo</p>;
}

function renderInicio() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RecepcionistaInicio />} />
          <Route path="/reservas/:id" element={<DetalleReservaStub />} />
          <Route path="/habitaciones/:id" element={<DetalleHabitacionStub />} />
          <Route path="/check-in" element={<CheckInStub />} />
          <Route path="/check-out/:reservaId" element={<CheckOutReservaStub />} />
          <Route path="/historial-mantenimiento" element={<HistorialMantenimientoStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue({ rol: "recepcionista", rolInfo: { label: "Recepcionista" }, usuario: "Fer" });
  listarReservas.mockImplementation(({ estado } = {}) => {
    if (estado === ESTADO_RESERVA.CONFIRMADA) return Promise.resolve([RESERVA_LLEGA_HOY, RESERVA_LLEGA_MANIANA]);
    if (estado === ESTADO_RESERVA.EN_CURSO) return Promise.resolve([RESERVA_SALE_HOY, RESERVA_SALE_MANIANA]);
    return Promise.resolve([]);
  });
  listarHabitaciones.mockImplementation(({ q } = {}) => {
    if (q) return Promise.resolve(HABITACIONES.filter((h) => h.numero === q));
    return Promise.resolve(HABITACIONES);
  });
  listarOrdenesMantenimiento.mockResolvedValue(ORDENES);
  buscarReservaParaCheckIn.mockRejectedValue({ response: { status: 404 } });
});

describe("RecepcionistaInicio — llegadas y salidas de hoy", () => {
  it('"Llegadas de hoy" solo trae reservas Confirmada cuya fechaDesde es hoy', async () => {
    renderInicio();

    expect(await screen.findByText("Marcos Beltrán")).toBeInTheDocument();
    expect(screen.queryByText("Julia Paz")).not.toBeInTheDocument();
    expect(screen.getByText(/Llegadas de hoy · 1/)).toBeInTheDocument();
  });

  it('"Salidas de hoy" solo trae reservas En curso cuya fechaHasta es hoy', async () => {
    renderInicio();

    expect(await screen.findByText("Laura Ríos")).toBeInTheDocument();
    expect(screen.queryByText("Nadia Cruz")).not.toBeInTheDocument();
    expect(screen.getByText(/Salidas de hoy · 1/)).toBeInTheDocument();
  });

  it("sin llegadas ni salidas de hoy muestra el estado vacío, no una sección en blanco", async () => {
    listarReservas.mockResolvedValue([]);
    renderInicio();

    expect(await screen.findByText("Sin llegadas para hoy.")).toBeInTheDocument();
    expect(screen.getByText("Sin salidas para hoy.")).toBeInTheDocument();
  });

  it('"→ Iniciar check-in" navega a /check-in con la reserva preseleccionada por código', async () => {
    const usuario = userEvent.setup();
    renderInicio();

    const link = await screen.findByRole("button", { name: /Iniciar check-in/ });
    await usuario.click(link);

    expect(await screen.findByText(`Check-in codigo=${RESERVA_LLEGA_HOY.codigoConfirmacion}`)).toBeInTheDocument();
  });

  it('"→ Iniciar check-out" navega directo a /check-out/:reservaId', async () => {
    const usuario = userEvent.setup();
    renderInicio();

    const link = await screen.findByRole("button", { name: /Iniciar check-out/ });
    await usuario.click(link);

    expect(await screen.findByText(`Check-out de la reserva ${RESERVA_SALE_HOY.id}`)).toBeInTheDocument();
  });
});

describe("RecepcionistaInicio — resumen de habitaciones por estado", () => {
  it("muestra el conteo real de cada estado", async () => {
    renderInicio();

    expect(await screen.findByRole("button", { name: "Libre 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocupada 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "En mantenimiento 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bloqueada 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "En limpieza 1" })).toBeInTheDocument();
  });

  it("click en un estado lleva al Panel de Habitaciones filtrado por ese estado", async () => {
    const usuario = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<RecepcionistaInicio />} />
            <Route path="/habitaciones" element={<p>Panel de Habitaciones</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await usuario.click(await screen.findByRole("button", { name: "Libre 2" }));
    expect(await screen.findByText("Panel de Habitaciones")).toBeInTheDocument();
  });
});

describe("RecepcionistaInicio — mantenimiento pendiente", () => {
  it("muestra solo las órdenes Pendiente, con badge Urgente cuando corresponde, y el link Ver todo", async () => {
    renderInicio();

    expect(await screen.findByText("Hab. 23")).toBeInTheDocument();
    expect(screen.getByText("Hab. 101")).toBeInTheDocument();
    expect(screen.queryByText("Hab. 50")).not.toBeInTheDocument(); // Resuelta, no debe listarse
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver todo/ })).toHaveAttribute("href", "/historial-mantenimiento");
  });

  it("limita la lista a 5 órdenes aunque haya más pendientes", async () => {
    const muchasPendientes = Array.from({ length: 7 }, (_, i) => ({
      id: 100 + i,
      estado: "Pendiente",
      urgente: false,
      tipoTarea: "Preventivo",
      habitacion: { numero: String(200 + i) },
    }));
    listarOrdenesMantenimiento.mockResolvedValue(muchasPendientes);
    renderInicio();

    expect(await screen.findByText("Hab. 200")).toBeInTheDocument();
    expect(screen.getByText("Hab. 204")).toBeInTheDocument();
    expect(screen.queryByText("Hab. 206")).not.toBeInTheDocument();
  });
});

describe("RecepcionistaInicio — buscador único del header", () => {
  it("código de confirmación: matchea por buscarReservaParaCheckIn y va al Detalle de la reserva", async () => {
    buscarReservaParaCheckIn.mockResolvedValueOnce({ reserva: { id: 99 }, puedeIniciarCheckIn: true, motivoBloqueo: null });
    const usuario = userEvent.setup();
    renderInicio();

    const input = await screen.findByPlaceholderText(/Buscar por código, documento o N° de habitación/);
    await usuario.type(input, "RS-8F2K91");
    await usuario.keyboard("{Enter}");

    expect(buscarReservaParaCheckIn).toHaveBeenCalledWith({ codigo: "RS-8F2K91" });
    expect(await screen.findByText("Detalle de la reserva 99")).toBeInTheDocument();
  });

  it("documento del huésped: mismo endpoint (obtenerPorCodigoODocumento vía buscarReservaParaCheckIn), va al Detalle de la reserva", async () => {
    buscarReservaParaCheckIn.mockResolvedValueOnce({ reserva: { id: 77 }, puedeIniciarCheckIn: true, motivoBloqueo: null });
    const usuario = userEvent.setup();
    renderInicio();

    const input = await screen.findByPlaceholderText(/Buscar por código, documento o N° de habitación/);
    await usuario.type(input, "32145998");
    await usuario.keyboard("{Enter}");

    expect(buscarReservaParaCheckIn).toHaveBeenCalledWith({ codigo: "32145998" });
    expect(await screen.findByText("Detalle de la reserva 77")).toBeInTheDocument();
  });

  it("número de habitación: si no matchea ninguna reserva, resuelve por habitación exacta y va a su Detalle", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    const input = await screen.findByPlaceholderText(/Buscar por código, documento o N° de habitación/);
    await usuario.type(input, "103");
    await usuario.keyboard("{Enter}");

    expect(await screen.findByText("Detalle de la habitación 3")).toBeInTheDocument();
  });

  it("sin coincidencias en ningún lado: muestra un toast, no navega", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    const input = await screen.findByPlaceholderText(/Buscar por código, documento o N° de habitación/);
    await usuario.type(input, "no-existe-999");
    await usuario.keyboard("{Enter}");

    expect(await screen.findByText(/No se encontró ninguna reserva ni habitación/)).toBeInTheDocument();
    expect(screen.queryByText(/Detalle de la reserva/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Detalle de la habitación/)).not.toBeInTheDocument();
  });
});
