import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReservaWizard } from "./ReservaWizard";
import { consultarDisponibilidad, crearReserva, modificarReserva } from "./reservas.api";
import { registrarPagoEstadia } from "../pagos-estadia/pagoEstadia.api";

vi.mock("./reservas.api", () => ({
  consultarDisponibilidad: vi.fn(),
  crearReserva: vi.fn(),
  modificarReserva: vi.fn(),
}));
vi.mock("../pagos-estadia/pagoEstadia.api", () => ({ registrarPagoEstadia: vi.fn() }));

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
  resumenPorTipo: [{ tipo: "Doble", total: 1, disponibles: 1, tarifaDesde: 50000, capacidadMaxima: 2 }],
};

const RESERVA_CREADA = {
  id: 99,
  codigoConfirmacion: "RS-NUEVA01",
  estado: "Confirmada",
  totalEstimadoAlojamiento: 150000,
  habitaciones: [HABITACION_101],
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
    // crearReserva todavía no se llamó.
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
    expect(crearReserva).not.toHaveBeenCalled();
  });

  it("paso 4: cobra la seña en efectivo y recién ahí crea la reserva y llama a onExito", async () => {
    crearReserva.mockResolvedValue(RESERVA_CREADA);
    registrarPagoEstadia.mockResolvedValue({ id: 1, estado: "Parcial", concepto: "Seña" });
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

    await waitFor(() => expect(crearReserva).toHaveBeenCalledTimes(1));
    expect(crearReserva.mock.calls[0][0]).toMatchObject({
      fechaDesde: "2026-10-10",
      fechaHasta: "2026-10-13",
      habitacionIds: [1],
      origen: "RECEPCION",
    });
    await waitFor(() => expect(registrarPagoEstadia).toHaveBeenCalledTimes(1));
    expect(registrarPagoEstadia).toHaveBeenCalledWith({
      reservaId: 99,
      medios: [{ tipo: "Efectivo", importe: 30000, referencia: undefined }],
      concepto: "Seña",
    });
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
    crearReserva.mockResolvedValue(RESERVA_CREADA);
    registrarPagoEstadia.mockResolvedValue({ id: 1, estado: "Parcial", concepto: "Seña" });
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
      expect(registrarPagoEstadia).toHaveBeenCalledWith({
        reservaId: 99,
        medios: [{ tipo: "Transferencia", importe: 30000, referencia: undefined }],
        concepto: "Seña",
      })
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

  it("si crearReserva ya tuvo éxito y falla el cobro de la seña, un reintento NO vuelve a crear la reserva", async () => {
    crearReserva.mockResolvedValue(RESERVA_CREADA);
    registrarPagoEstadia.mockRejectedValueOnce({ response: { data: { error: "Falló el cobro" } } });
    registrarPagoEstadia.mockResolvedValueOnce({ id: 1, estado: "Parcial", concepto: "Seña" });
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a3();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Seña requerida (20%)");
    fireEvent.change(screen.getByLabelText("Medio de pago de la seña *"), { target: { value: "Efectivo" } });
    fireEvent.click(screen.getByRole("checkbox"));

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    fireEvent.click(confirmar);
    await waitFor(() => expect(registrarPagoEstadia).toHaveBeenCalledTimes(1));
    await screen.findByText("Falló el cobro");
    expect(crearReserva).toHaveBeenCalledTimes(1);

    // Reintentar: no hay Atrás/Cancelar (la reserva ya existe), solo se
    // puede volver a intentar el cobro.
    expect(screen.queryByRole("button", { name: "Atrás" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();

    fireEvent.click(confirmar);
    await waitFor(() => expect(registrarPagoEstadia).toHaveBeenCalledTimes(2));
    expect(crearReserva).toHaveBeenCalledTimes(1); // sigue en 1, no se duplicó la reserva
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
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
    expect(registrarPagoEstadia).not.toHaveBeenCalled();
    await waitFor(() => expect(onExito).toHaveBeenCalled());
  });

  it("autoservicio web (origen WEB): tampoco pide seña", async () => {
    crearReserva.mockResolvedValue({ ...RESERVA_CREADA, totalEstimadoAlojamiento: 150000 });
    renderWizard({ origen: "WEB" });

    expect(screen.queryByText(/Seña/)).not.toBeInTheDocument();
    await completarPasos1a3();

    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeInTheDocument();
    expect(registrarPagoEstadia).not.toHaveBeenCalled();
  });
});
