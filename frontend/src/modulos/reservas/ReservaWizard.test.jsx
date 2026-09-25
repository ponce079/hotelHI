import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReservaWizard } from "./ReservaWizard";
import { consultarDisponibilidad, crearReserva, crearReservaConSena, modificarReserva } from "./reservas.api";

vi.mock("./reservas.api", () => ({
  consultarDisponibilidad: vi.fn(),
  crearReserva: vi.fn(),
  crearReservaConSena: vi.fn(),
  modificarReserva: vi.fn(),
}));

const HABITACION_101 = {
  id: 1,
  numero: "101",
  tipo: "Doble",
  capacidad: 2,
  piso: 1,
  equipamiento: null,
  estado: "libre",
  estadoActual: null,
  tarifaPorNoche: 50000,
  totalEstadia: 150000,
};

const DISPONIBILIDAD = {
  fechaDesde: "2026-10-10T00:00:00.000Z",
  fechaHasta: "2026-10-13T00:00:00.000Z",
  noches: 3,
  habitaciones: [HABITACION_101],
  // Con incluirOcupadas (origen !== "WEB", el caso por defecto de estos
  // tests) el wizard arma la grilla del paso 2 desde `todas`, no desde
  // `habitaciones` — ver mostrarOcupadas en ReservaWizard.jsx.
  todas: [{ ...HABITACION_101, disponible: true, motivo: null }],
  resumenPorTipo: [{ tipo: "Doble", total: 1, disponibles: 1, tarifaDesde: 50000, capacidadMaxima: 2 }],
};

const RESERVA_CREADA = {
  id: 99,
  codigoConfirmacion: "RS-NUEVA01",
  estado: "Confirmada",
  totalEstimadoAlojamiento: 150000,
  habitaciones: [HABITACION_101],
  pagoSenia: { id: 1, estado: "Parcial", concepto: "Seña" },
};

function renderWizard(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onExito = vi.fn();
  const onCancelar = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ReservaWizard onExito={onExito} onCancelar={onCancelar} {...props} />
    </QueryClientProvider>
  );
  return { ...utils, onExito, onCancelar };
}

// Completa los pasos 1 a 3 (idénticos con o sin seña) y deja el wizard
// parado justo antes del botón final del paso que corresponda.
async function completarPasos1a3() {
  fireEvent.change(screen.getByLabelText("Entrada (check-in) *"), { target: { value: "2026-10-10" } });
  fireEvent.change(screen.getByLabelText("Salida (check-out) *"), { target: { value: "2026-10-13" } });
  await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));

  fireEvent.click(await screen.findByText("101"));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

  fireEvent.change(await screen.findByLabelText("Nombre y apellido *"), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText("Número *"), { target: { value: "30111222" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico *"), { target: { value: "ana@mail.com" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  consultarDisponibilidad.mockResolvedValue(DISPONIBILIDAD);
});

describe("ReservaWizard — alta asistida por mostrador (seña obligatoria, HU-88)", () => {
  it("muestra 4 pasos, con 'Seña' al final, y el paso 3 avanza en vez de confirmar", async () => {
    renderWizard({ origen: "RECEPCION" });

    expect(screen.getByText(/Seña/)).toBeInTheDocument();
    await completarPasos1a3();

    // Paso 3 (no es el último): botón "Siguiente", no "Confirmar reserva" —
    // todavía no se mandó nada a la base (ni la reserva ni la seña).
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
    expect(crearReservaConSena).not.toHaveBeenCalled();
  });

  it("paso 4: un único submit crea la reserva y cobra la seña en efectivo de forma atómica", async () => {
    crearReservaConSena.mockResolvedValue(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a3();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(await screen.findByText("Seña requerida (20%)")).toBeInTheDocument();
    expect(screen.getByText("$ 30.000")).toBeInTheDocument(); // 20% de 150000

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Medio de pago de la seña *"), { target: { value: "Efectivo" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmar).toBeEnabled();

    fireEvent.click(confirmar);

    // Un solo POST con todo junto: datos de reserva + medio de pago de la
    // seña — nunca 2 llamadas separadas.
    await waitFor(() => expect(crearReservaConSena).toHaveBeenCalledTimes(1));
    expect(crearReservaConSena).toHaveBeenCalledWith(
      expect.objectContaining({
        fechaDesde: "2026-10-10",
        fechaHasta: "2026-10-13",
        habitacionIds: [1],
        origen: "RECEPCION",
        medios: [{ tipo: "Efectivo", importe: 30000, referencia: undefined }],
      })
    );
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
  });

  it("paso 4 con tarjeta: no deja confirmar hasta autorizar la terminal simulada", async () => {
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a3();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Seña requerida (20%)");

    fireEvent.change(screen.getByLabelText("Medio de pago de la seña *"), { target: { value: "Tarjeta crédito" } });
    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    expect(confirmar).toBeDisabled();
    expect(screen.getByRole("button", { name: /Autorizar tarjeta/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Autorizar tarjeta/ }));

    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText("Número de tarjeta"), { target: { value: "4242424242424242" } });
      fireEvent.change(screen.getByLabelText("Titular"), { target: { value: "ANA PEREZ" } });
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
    expect(confirmar).toBeEnabled();
  });

  it("ofrece los 4 medios (efectivo, transferencia, tarjeta de crédito y débito)", async () => {
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a3();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Seña requerida (20%)");

    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual(
      expect.arrayContaining(["Efectivo", "Transferencia", "Tarjeta de crédito", "Tarjeta de débito"])
    );
  });

  it("con Transferencia, alcanza con la confirmación manual (sin terminal de tarjeta)", async () => {
    crearReservaConSena.mockResolvedValue(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a3();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Seña requerida (20%)");

    fireEvent.change(screen.getByLabelText("Medio de pago de la seña *"), { target: { value: "Transferencia" } });
    expect(screen.queryByRole("button", { name: /Autorizar tarjeta/ })).not.toBeInTheDocument();

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    expect(confirmar).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmar).toBeEnabled();

    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(crearReservaConSena).toHaveBeenCalledWith(
        expect.objectContaining({
          medios: [{ tipo: "Transferencia", importe: 30000, referencia: undefined }],
        })
      )
    );
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
  });

  it("con Tarjeta de débito también pasa por la terminal simulada, sin selector de cuotas", async () => {
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a3();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Seña requerida (20%)");

    fireEvent.change(screen.getByLabelText("Medio de pago de la seña *"), { target: { value: "Tarjeta débito" } });
    fireEvent.click(screen.getByRole("button", { name: /Autorizar tarjeta/ }));

    expect(screen.queryByLabelText("Cuotas")).not.toBeInTheDocument();
  });

  it("si el cobro de la seña falla, no queda nada creado — Atrás/Cancelar siguen disponibles y el reintento manda todo de nuevo", async () => {
    crearReservaConSena.mockRejectedValueOnce({ response: { data: { error: "Tarjeta rechazada" } } });
    crearReservaConSena.mockResolvedValueOnce(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a3();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Seña requerida (20%)");
    fireEvent.change(screen.getByLabelText("Medio de pago de la seña *"), { target: { value: "Efectivo" } });
    fireEvent.click(screen.getByRole("checkbox"));

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    fireEvent.click(confirmar);
    await waitFor(() => expect(crearReservaConSena).toHaveBeenCalledTimes(1));
    await screen.findByText(/Tarjeta rechazada/);
    expect(screen.getByText(/No se guardó nada/)).toBeInTheDocument();

    // Como nada se persistió (la transacción atómica revirtió todo), el
    // recepcionista puede seguir volviendo atrás o cancelar — a diferencia
    // del flujo viejo de 2 llamadas, acá no hay "reserva ya creada" que lo
    // impida.
    expect(screen.getByRole("button", { name: "Atrás" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();

    // Reintentar manda TODO de nuevo (reserva + seña), no solo el pago —
    // no hay una reserva previa a la que "engancharse".
    fireEvent.click(confirmar);
    await waitFor(() => expect(crearReservaConSena).toHaveBeenCalledTimes(2));
    expect(crearReservaConSena.mock.calls[1][0]).toMatchObject({
      fechaDesde: "2026-10-10",
      fechaHasta: "2026-10-13",
      habitacionIds: [1],
    });
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
  });
});

describe("ReservaWizard — arranca con habitaciones ya elegidas (desde Disponibilidad interna)", () => {
  it("con habitacionIds en valoresIniciales, arranca directo en el paso 3 con 1 y 2 ya hechos", async () => {
    renderWizard({
      origen: "RECEPCION",
      valoresIniciales: { fechaDesde: "2026-10-10", fechaHasta: "2026-10-13", habitacionIds: [1] },
    });

    // Paso 3 desde el vamos: el campo de huésped ya está visible, sin
    // haber tocado nada de fechas ni habitaciones.
    expect(await screen.findByLabelText("Nombre y apellido *")).toBeInTheDocument();
    expect(screen.getByText("✓ Fechas de la estadía")).toBeInTheDocument();
    expect(screen.getByText("✓ Habitaciones")).toBeInTheDocument();

    // El resumen ya muestra la habitación elegida y su total, sin que el
    // recepcionista haya pasado por el paso 2.
    expect(await screen.findByText(/101 \(Doble\)/)).toBeInTheDocument();

    // No queda bloqueado: si hace falta corregir algo, "Atrás" sigue ahí.
    expect(screen.getByRole("button", { name: "Atrás" })).toBeEnabled();
  });

  it("sin habitacionIds (autoservicio web de siempre), sigue arrancando en el paso 1", () => {
    renderWizard({ origen: "WEB", valoresIniciales: { fechaDesde: "2026-10-10", fechaHasta: "2026-10-13" } });

    expect(screen.getByLabelText("Entrada (check-in) *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre y apellido *")).not.toBeInTheDocument();
  });
});

describe("ReservaWizard — edición y autoservicio web quedan sin cambios (sin seña)", () => {
  const RESERVA_EXISTENTE = {
    id: 7,
    fechaDesde: "2026-10-10T00:00:00.000Z",
    fechaHasta: "2026-10-13T00:00:00.000Z",
    habitaciones: [{ id: 1, numero: "101", tipo: "Doble" }],
    huesped: { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com", preferencias: "" },
  };

  it("edición: solo 3 pasos, sin 'Seña', y el paso 3 confirma directo ('Guardar cambios')", async () => {
    modificarReserva.mockResolvedValue({ ...RESERVA_EXISTENTE });
    const { onExito } = renderWizard({ reserva: RESERVA_EXISTENTE });

    expect(screen.queryByText(/Seña/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));
    // En edición, la habitación ya viene preseleccionada (estadoInicial toma
    // reserva.habitaciones) — no hay que volver a tocarla.
    await screen.findByText("101");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByLabelText("Nombre y apellido *");

    const guardar = screen.getByRole("button", { name: "Guardar cambios" });
    fireEvent.click(guardar);

    await waitFor(() => expect(modificarReserva).toHaveBeenCalledTimes(1));
    expect(crearReserva).not.toHaveBeenCalled();
    expect(crearReservaConSena).not.toHaveBeenCalled();
    await waitFor(() => expect(onExito).toHaveBeenCalled());
  });

  it("autoservicio web (origen WEB): tampoco pide seña, y sigue usando el alta simple (sin seña)", async () => {
    crearReserva.mockResolvedValue({ ...RESERVA_CREADA, totalEstimadoAlojamiento: 150000 });
    renderWizard({ origen: "WEB" });

    expect(screen.queryByText(/Seña/)).not.toBeInTheDocument();
    await completarPasos1a3();

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    fireEvent.click(confirmar);

    await waitFor(() => expect(crearReserva).toHaveBeenCalledTimes(1));
    expect(crearReservaConSena).not.toHaveBeenCalled();
  });
});
