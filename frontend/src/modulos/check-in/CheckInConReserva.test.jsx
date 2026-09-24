import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CheckInConReserva } from "./CheckInConReserva";
import { buscarReservaParaCheckIn } from "./checkIn.api";
import { listarLlegadasPendientes } from "../reservas/reservas.api";

vi.mock("./checkIn.api", () => ({
  buscarReservaParaCheckIn: vi.fn(),
  confirmarCheckInConReserva: vi.fn(),
}));
vi.mock("../reservas/reservas.api", () => ({ listarLlegadasPendientes: vi.fn() }));

const RESERVA = {
  id: 5,
  codigoConfirmacion: "RS-HOY01",
  estado: "Confirmada",
  cantidadHabitaciones: 1,
  huesped: { nombre: "Marcos Beltrán", tipoDocumento: "DNI", numeroDocumento: "30111222" },
  habitaciones: [{ numero: "301", tipo: "Doble" }],
  fechaDesde: "2026-09-21T00:00:00.000Z",
  fechaHasta: "2026-09-22T00:00:00.000Z",
  noches: 1,
  totalEstimadoAlojamiento: 50000,
};

function renderComponente(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CheckInConReserva {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listarLlegadasPendientes.mockResolvedValue([]);
});

// RecepcionistaInicio.jsx (Inicio del Recepcionista) linkea a
// /check-in?codigo=<codigoConfirmacion> desde el "→ Iniciar check-in" de
// una llegada de hoy — CheckInPage.jsx traduce ese query param a esta prop.
describe("CheckInConReserva — reserva preseleccionada por código", () => {
  it("con codigoPreseleccionado dispara la búsqueda automáticamente al montar, sin tipear nada", async () => {
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA, puedeIniciarCheckIn: true, motivoBloqueo: null });

    renderComponente({ codigoPreseleccionado: "RS-HOY01" });

    // El nombre del huésped aparece dos veces (ficha + PanelResumenCheckIn):
    // alcanza con confirmar que la búsqueda automática trajo la reserva.
    expect((await screen.findAllByText("Marcos Beltrán")).length).toBeGreaterThan(0);
    expect(buscarReservaParaCheckIn).toHaveBeenCalledWith({ codigo: "RS-HOY01" });
    expect(buscarReservaParaCheckIn).toHaveBeenCalledTimes(1);
  });

  it("sin codigoPreseleccionado no busca nada al montar (comportamiento manual de siempre)", () => {
    renderComponente();

    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });
});

// El filtro real (Confirmada, fechaDesde <= hoy) tiene prueba propia en
// reservas.api.test.js — acá interesa que la pantalla, sin nada tipeado,
// muestre lo que esa función devuelva, y que escribir la reemplace por el
// comportamiento de búsqueda de siempre (esto último no se toca).
describe("CheckInConReserva — lista por defecto de llegadas pendientes", () => {
  it("al entrar sin buscar nada, muestra la lista de llegadas pendientes de hoy (huésped, habitación, código)", async () => {
    listarLlegadasPendientes.mockResolvedValue([
      {
        id: 30,
        codigoConfirmacion: "RS-PEND01",
        huesped: { nombre: "Lucía Fernández" },
        habitaciones: [{ numero: "205", tipo: "Doble" }],
      },
    ]);

    renderComponente();

    expect(await screen.findByText("Lucía Fernández")).toBeInTheDocument();
    expect(screen.getByText("Hab. 205 · Doble")).toBeInTheDocument();
    expect(screen.getByText("RS-PEND01")).toBeInTheDocument();
    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });

  it("sin llegadas pendientes muestra un estado vacío explicativo, no una sección en blanco", async () => {
    listarLlegadasPendientes.mockResolvedValue([]);

    renderComponente();

    expect(
      await screen.findByText("Sin llegadas pendientes para hoy — buscá por código o documento si hace falta.")
    ).toBeInTheDocument();
  });

  it("al escribir en el buscador, la lista desaparece y se ve el comportamiento de búsqueda de siempre", async () => {
    listarLlegadasPendientes.mockResolvedValue([
      {
        id: 30,
        codigoConfirmacion: "RS-PEND01",
        huesped: { nombre: "Lucía Fernández" },
        habitaciones: [{ numero: "205", tipo: "Doble" }],
      },
    ]);
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA, puedeIniciarCheckIn: true, motivoBloqueo: null });
    const usuario = userEvent.setup();

    renderComponente();
    expect(await screen.findByText("Lucía Fernández")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Ej: RS-8F2K91 o 32.145.998");
    await usuario.type(input, "RS-HOY01");

    expect(screen.queryByText("Lucía Fernández")).not.toBeInTheDocument();
    expect(screen.queryByText("RS-PEND01")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findAllByText("Marcos Beltrán")).not.toHaveLength(0);
  });

  it("click en una llegada pendiente arranca su check-in directo, sin tipear nada", async () => {
    listarLlegadasPendientes.mockResolvedValue([
      {
        id: 30,
        codigoConfirmacion: "RS-PEND01",
        huesped: { nombre: "Lucía Fernández" },
        habitaciones: [{ numero: "205", tipo: "Doble" }],
      },
    ]);
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA, puedeIniciarCheckIn: true, motivoBloqueo: null });
    const usuario = userEvent.setup();

    renderComponente();
    await usuario.click(await screen.findByText("Lucía Fernández"));

    expect(buscarReservaParaCheckIn).toHaveBeenCalledWith({ codigo: "RS-PEND01" });
    expect((await screen.findAllByText("Marcos Beltrán")).length).toBeGreaterThan(0);
  });
});

// Corrección posterior (HU-46): la garantía con tarjeta pasó de una casilla
// suelta a reusar TarjetaSimuladaPanel de verdad — ver GarantiaFieldset.jsx.
describe("CheckInConReserva — garantía con tarjeta reusa TarjetaSimuladaPanel", () => {
  it("con Tarjeta de crédito (default) no hay ninguna casilla: aparece el botón para autorizar la terminal simulada", async () => {
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA, puedeIniciarCheckIn: true, motivoBloqueo: null });

    renderComponente({ codigoPreseleccionado: "RS-HOY01" });
    await screen.findAllByText("Marcos Beltrán");

    expect(screen.queryByText(/Confirmo que el huésped presentó/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Autorizar tarjeta/ })).toBeInTheDocument();
  });

  // Fake timers recién DESPUÉS de que la búsqueda inicial (una promesa real)
  // resolvió, y fireEvent en vez de userEvent para completar la tarjeta —
  // mismo criterio que PagoEstadiaWizard.test.jsx: mezclar timers falsos con
  // el polling interno de findBy*/userEvent antes de tiempo cuelga el test.
  it("autorizar la tarjeta simulada confirma la garantía sola, sin tildar nada a mano", async () => {
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA, puedeIniciarCheckIn: true, motivoBloqueo: null });

    renderComponente({ codigoPreseleccionado: "RS-HOY01" });
    await screen.findAllByText("Marcos Beltrán");

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: /Autorizar tarjeta/ }));
      fireEvent.change(screen.getByLabelText("Número de tarjeta"), { target: { value: "4242424242424242" } });
      fireEvent.change(screen.getByLabelText("Titular"), { target: { value: "MARCOS BELTRAN" } });
      fireEvent.change(screen.getByLabelText("Vencimiento (MM/AA)"), { target: { value: "1228" } });
      fireEvent.change(screen.getByLabelText("Código de seguridad"), { target: { value: "123" } });
      fireEvent.click(screen.getByRole("button", { name: /Autorizar \$/ }));
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(screen.getByText("Autorizada")).toBeInTheDocument();

    // El resto del formulario ya estaba OK (mismo documento que la reserva)
    // — con la tarjeta autorizada, "Confirmar check-in" tiene que habilitarse.
    fireEvent.change(screen.getByLabelText(/Documento presentado/), { target: { value: "30111222" } });
    expect(screen.getByRole("button", { name: "Confirmar check-in" })).toBeEnabled();
  });
});
