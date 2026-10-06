import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReservaWizard } from "./ReservaWizard";
import { consultarDisponibilidad, cotizarReserva, crearReserva, crearReservaConGarantia, modificarReserva } from "./reservas.api";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";
import { listarPlanesTarifarios } from "../tarifas/tarifas.api";

vi.mock("./reservas.api", () => ({
  consultarDisponibilidad: vi.fn(),
  cotizarReserva: vi.fn(),
  crearReserva: vi.fn(),
  crearReservaConGarantia: vi.fn(),
  modificarReserva: vi.fn(),
}));

// HU-89: el select de tipo del paso 2 sale del catálogo, no de resumenPorTipo.
vi.mock("../tipos-habitacion/tiposHabitacion.api", () => ({
  listarTiposHabitacion: vi.fn().mockResolvedValue([{ id: 10, codigo: "DOBLE", nombre: "Doble", activo: true }]),
}));

// Etapa 4A — el id real del plan (planTarifarioId) sale del catálogo de
// planes activos, no de la cotización (que solo identifica por `codigo`).
vi.mock("../tarifas/tarifas.api", () => ({
  listarPlanesTarifarios: vi.fn().mockResolvedValue([
    { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, activo: true },
  ]),
}));

const HABITACION_101 = {
  id: 1,
  numero: "101",
  tipo: "Doble",
  tipoHabitacionId: 10,
  capacidad: 2,
  piso: 1,
  equipamiento: null,
  estado: "libre",
  estadoActual: null,
  planes: [{ codigo: "BAR", nombre: "Best Available Rate", total: 150000, promedioPorNoche: 50000, reembolsable: true }],
  motivoNoDisponible: null,
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
  resumenPorTipo: [{ tipo: "Doble", tipoHabitacionId: 10, total: 1, disponibles: 1, tarifaDesde: 50000, capacidadMaxima: 2 }],
};

const COTIZACION = {
  fechaVenta: "2026-10-01",
  noches: 3,
  estadiaMinimaExigida: null,
  planes: [
    {
      codigo: "BAR",
      nombre: "Best Available Rate",
      tipo: "BASE",
      reembolsable: true,
      horasCancelacionSinCargo: 48,
      penalidadNoShow: "PRIMERA_NOCHE",
      visibleWeb: true,
      habitaciones: [{ habitacionId: 1, numero: "101", adultos: 2, menores: 0, detalle: [], total: 150000 }],
      total: 150000,
      promedioPorNoche: 50000,
    },
  ],
};

const RESERVA_CREADA = {
  id: 99,
  codigoConfirmacion: "RS-NUEVA01",
  estado: "Confirmada",
  totalEstimadoAlojamiento: 150000,
  habitaciones: [{ ...HABITACION_101, adultos: 2, menores: 0 }],
  garantia: { tipo: "TARJETA", estado: "Vigente", marca: "Visa", ultimos4: "4242", monto: 0 },
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

// Completa los pasos 1 a 4 (Fechas, Habitaciones, Plan, Huésped — idénticos
// con o sin garantía) y deja el wizard parado justo antes del botón final del
// paso que corresponda.
async function completarPasos1a4() {
  fireEvent.change(screen.getByLabelText("Entrada (check-in) *"), { target: { value: "2026-10-10" } });
  fireEvent.change(screen.getByLabelText("Salida (check-out) *"), { target: { value: "2026-10-13" } });
  await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));

  fireEvent.click(await screen.findByText("101"));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

  fireEvent.click(await screen.findByText("Best Available Rate"));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

  // Minúsculas a propósito: al salir del campo quedan con mayúscula inicial (y partículas en minúscula).
  fireEvent.change(await screen.findByLabelText("Nombres*"), { target: { value: "ana maría" } });
  fireEvent.blur(screen.getByLabelText("Nombres*"));
  fireEvent.change(screen.getByLabelText("Apellido*"), { target: { value: "pérez de la vega" } });
  fireEvent.blur(screen.getByLabelText("Apellido*"));
  fireEvent.change(screen.getByLabelText("País emisor*"), { target: { value: "AR" } });
  fireEvent.change(screen.getByLabelText("Nacimiento*"), { target: { value: "1990-01-01" } });
  fireEvent.change(screen.getByLabelText("Número*"), { target: { value: "30111222" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico*"), { target: { value: "ana@mail.com" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  consultarDisponibilidad.mockResolvedValue(DISPONIBILIDAD);
  cotizarReserva.mockResolvedValue(COTIZACION);
  listarPlanesTarifarios.mockResolvedValue([
    { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, activo: true },
  ]);
});

const TARJETA_OK = "4242424242424242";

// Llena el formulario de tarjeta del paso Garantía.
function completarTarjeta({ numero = TARJETA_OK, titular = "ANA PEREZ", vencimiento = "1230", cvv = "123" } = {}) {
  fireEvent.change(screen.getByLabelText("Número de tarjeta *"), { target: { value: numero } });
  fireEvent.change(screen.getByLabelText("Titular *"), { target: { value: titular } });
  fireEvent.change(screen.getByLabelText("Vencimiento (MM/AA) *"), { target: { value: vencimiento } });
  fireEvent.change(screen.getByLabelText("Código de seguridad *"), { target: { value: cvv } });
}

describe("ReservaWizard — alta asistida por mostrador (garantía con tarjeta)", () => {
  it("muestra 5 pasos, con 'Garantía' al final, y el paso de huésped avanza en vez de confirmar", async () => {
    renderWizard({ origen: "RECEPCION" });

    expect(screen.getByText(/Garantía/)).toBeInTheDocument();
    await completarPasos1a4();

    // Paso de huésped (no es el último): "Siguiente", no "Confirmar reserva" —
    // todavía no se mandó nada (ni la reserva ni la garantía).
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
    expect(crearReservaConGarantia).not.toHaveBeenCalled();
  });

  it("BAR con tarjeta: un único POST con la tarjeta, sin cobro; el CVV y el número se descartan al terminar", async () => {
    crearReservaConGarantia.mockResolvedValue(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    // BAR es reembolsable: no se cobra nada al reservar.
    expect(await screen.findByText("Se cobra al reservar")).toBeInTheDocument();
    expect(screen.getByText("$ 0")).toBeInTheDocument();
    expect(screen.getByText(/no se cobra nada ahora/i)).toBeInTheDocument();

    completarTarjeta();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    await waitFor(() => expect(crearReservaConGarantia).toHaveBeenCalledTimes(1));
    expect(crearReservaConGarantia).toHaveBeenCalledWith(
      expect.objectContaining({
        fechaDesde: "2026-10-10",
        fechaHasta: "2026-10-13",
        habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
        planTarifarioId: 1,
        totalEsperado: 150000,
        origen: "RECEPCION",
        huesped: expect.objectContaining({ nombres: "Ana María", apellido: "Pérez de la Vega" }),
        garantia: {
          tipo: "TARJETA",
          tarjeta: { titular: "ANA PEREZ", numero: TARJETA_OK, vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" },
        },
        claveIdempotencia: expect.any(String),
      })
    );
    expect(crearReservaConGarantia.mock.calls[0][0].huesped).not.toHaveProperty("nombre");
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
    // El número y el CVV no viajan a ningún lado más: ni a la reserva ya creada
    // que recibe onExito ni a localStorage.
    expect(JSON.stringify(onExito.mock.calls)).not.toContain(TARJETA_OK);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TARJETA_OK);
  });

  it("no deja confirmar con datos de tarjeta inválidos y marca qué falta (sin llamar al backend)", async () => {
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Se cobra al reservar");

    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    expect(await screen.findByText("Número de tarjeta inválido.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá el titular.")).toBeInTheDocument();
    expect(screen.getByText("Vencimiento inválido (MM/AA).")).toBeInTheDocument();
    expect(crearReservaConGarantia).not.toHaveBeenCalled();
  });

  it("tarjeta que vence antes de la salida: se rechaza en pantalla", async () => {
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a4(); // salida 2026-10-13
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Se cobra al reservar");

    completarTarjeta({ vencimiento: "0926" }); // vence 30/09/2026
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    expect(await screen.findByText("La tarjeta vence antes de la fecha de salida.")).toBeInTheDocument();
    expect(crearReservaConGarantia).not.toHaveBeenCalled();
  });

  it("tarjeta rechazada por la pasarela: no se crea nada, el CVV se borra y el reintento usa otra clave de idempotencia", async () => {
    crearReservaConGarantia.mockRejectedValueOnce({
      response: { status: 402, data: { error: "La tarjeta fue rechazada: Fondos insuficientes." } },
    });
    crearReservaConGarantia.mockResolvedValueOnce(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Se cobra al reservar");
    completarTarjeta({ numero: "4000000000000002" });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    await waitFor(() => expect(crearReservaConGarantia).toHaveBeenCalledTimes(1));
    await screen.findByText(/Fondos insuficientes/);
    // Master reemplazó el aviso "No se guardó nada" por el manejo de vencimiento del guardado.
    expect(screen.queryByText(/No se guardó nada/)).not.toBeInTheDocument();
    expect(onExito).not.toHaveBeenCalled();

    // El código de seguridad no se conserva tras un intento fallido.
    expect(screen.getByLabelText("Código de seguridad *")).toHaveValue("");
    // Atrás/Cancelar siguen disponibles: nada quedó persistido.
    expect(screen.getByRole("button", { name: "Atrás" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();

    // Reintento con otra tarjeta: manda TODO de nuevo y con una clave nueva.
    completarTarjeta({ numero: TARJETA_OK });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    await waitFor(() => expect(crearReservaConGarantia).toHaveBeenCalledTimes(2));
    const [primera, segunda] = crearReservaConGarantia.mock.calls.map((c) => c[0]);
    expect(segunda.claveIdempotencia).not.toBe(primera.claveIdempotencia);
    expect(segunda).toMatchObject({ fechaDesde: "2026-10-10", habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }] });
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
  });

  it("prepago (sin tarjeta) en BAR: manda medios con el importe, sin datos de tarjeta", async () => {
    crearReservaConGarantia.mockResolvedValue(RESERVA_CREADA);
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Se cobra al reservar");

    fireEvent.change(screen.getByLabelText("Cómo se garantiza la reserva *"), { target: { value: "PREPAGO" } });
    fireEvent.change(screen.getByLabelText("Medio de pago *"), { target: { value: "Transferencia" } });
    fireEvent.change(screen.getByLabelText("Importe prepagado *"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    await waitFor(() => expect(crearReservaConGarantia).toHaveBeenCalledTimes(1));
    expect(crearReservaConGarantia.mock.calls[0][0].garantia).toEqual({
      tipo: "PREPAGO",
      medios: [{ tipo: "Transferencia", importe: 50000 }],
    });
  });

  it("prepago: no puede superar el total y el débito exige la autorización", async () => {
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Se cobra al reservar");

    fireEvent.change(screen.getByLabelText("Cómo se garantiza la reserva *"), { target: { value: "PREPAGO" } });
    fireEvent.change(screen.getByLabelText("Medio de pago *"), { target: { value: "Tarjeta débito" } });
    fireEvent.change(screen.getByLabelText("Importe prepagado *"), { target: { value: "999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    expect(await screen.findByText("El prepago no puede superar el total de la estadía.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá la autorización de la tarjeta.")).toBeInTheDocument();
    expect(crearReservaConGarantia).not.toHaveBeenCalled();
  });
});

describe("ReservaWizard — tarifa no reembolsable (NRF)", () => {
  beforeEach(() => {
    const nrf = { codigo: "NRF", nombre: "Tarifa promocional NRF", total: 135000, promedioPorNoche: 45000, reembolsable: false };
    cotizarReserva.mockResolvedValue({ ...COTIZACION, planes: [...COTIZACION.planes, nrf] });
    listarPlanesTarifarios.mockResolvedValue([
      { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, activo: true },
      { id: 2, codigo: "NRF", nombre: "Tarifa promocional NRF", reembolsable: false, horasCancelacionSinCargo: null, activo: true },
    ]);
  });

  async function irAGarantiaConNRF() {
    fireEvent.change(screen.getByLabelText("Entrada (check-in) *"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Salida (check-out) *"), { target: { value: "2026-10-13" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));
    fireEvent.click(await screen.findByText("101"));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(await screen.findByText("Tarifa promocional NRF"));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(await screen.findByLabelText("Nombres*"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Apellido*"), { target: { value: "Pérez" } });
    fireEvent.change(screen.getByLabelText("País emisor*"), { target: { value: "AR" } });
    fireEvent.change(screen.getByLabelText("Nacimiento*"), { target: { value: "1990-01-01" } });
    fireEvent.change(screen.getByLabelText("Número*"), { target: { value: "30111222" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico*"), { target: { value: "ana@mail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  }

  it("avisa que se cobra el total al confirmar y manda totalEsperado del NRF", async () => {
    crearReservaConGarantia.mockResolvedValue(RESERVA_CREADA);
    renderWizard({ origen: "RECEPCION" });
    await irAGarantiaConNRF();

    expect(await screen.findByText(/Se cobra al confirmar \(tarifa no reembolsable\)/)).toBeInTheDocument();
    // El total aparece en el resumen y como cifra del cobro al confirmar.
    expect(screen.getAllByText("$ 135.000")).toHaveLength(2);

    completarTarjeta();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    await waitFor(() => expect(crearReservaConGarantia).toHaveBeenCalledTimes(1));
    expect(crearReservaConGarantia.mock.calls[0][0]).toMatchObject({ planTarifarioId: 2, totalEsperado: 135000 });
  });

  it("sin tarjeta, el prepago del NRF es por el total y el importe no se puede editar", async () => {
    renderWizard({ origen: "RECEPCION" });
    await irAGarantiaConNRF();
    await screen.findByText(/Se cobra al confirmar/);

    fireEvent.change(screen.getByLabelText("Cómo se garantiza la reserva *"), { target: { value: "PREPAGO" } });

    expect(screen.getByLabelText("Importe prepagado *")).toHaveValue("135000");
    expect(screen.getByLabelText("Importe prepagado *")).toBeDisabled();
  });
});

describe("ReservaWizard — vencimiento del guardado", () => {
  async function enviar() {
    renderWizard();
    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Se cobra al reservar");
    completarTarjeta();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
  }
  const vencido = {
    response: {
      status: 408,
      data: { codigo: "RESERVA_TIEMPO_AGOTADO", error: "Se terminó el tiempo de guardado (1 minuto)." },
    },
  };

  it("conserva datos, actualiza disponibilidad y permite un segundo intento explícito", async () => {
    crearReservaConGarantia.mockRejectedValueOnce(vencido).mockResolvedValueOnce(RESERVA_CREADA);
    await enviar();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    const consultas = consultarDisponibilidad.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Actualizar disponibilidad para reintentar/ }));
    await waitFor(() => expect(screen.queryByText(/El intento venció/)).not.toBeInTheDocument());
    expect(consultarDisponibilidad.mock.calls.length).toBeGreaterThan(consultas);
    expect(crearReservaConGarantia).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByText("Best Available Rate"));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    // El número y el titular se conservan; el código de seguridad NO (se borra tras un intento fallido).
    expect(screen.getByLabelText("Código de seguridad *")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Código de seguridad *"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    await waitFor(() => expect(crearReservaConGarantia).toHaveBeenCalledTimes(2));
    // Mismo pedido; solo cambia la clave de idempotencia (cada intento usa una nueva).
    const [primero, segundo] = crearReservaConGarantia.mock.calls.map((c) => c[0]);
    expect({ ...segundo, claveIdempotencia: undefined }).toEqual({ ...primero, claveIdempotencia: undefined });
    expect(segundo.claveIdempotencia).not.toBe(primero.claveIdempotencia);
  });

  it("si actualizar falla conserva el bloqueo; si la habitación se ocupó vuelve a selección", async () => {
    crearReservaConGarantia.mockRejectedValueOnce(vencido);
    await enviar();
    await screen.findByRole("alert");
    consultarDisponibilidad.mockRejectedValueOnce(new Error("Sin conexión"));
    fireEvent.click(screen.getByRole("button", { name: /Actualizar disponibilidad para reintentar/ }));
    await screen.findByText(/No se pudo actualizar/);
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    consultarDisponibilidad.mockResolvedValueOnce({ ...DISPONIBILIDAD, habitaciones: [], todas: [] });
    fireEvent.click(screen.getByRole("button", { name: /Actualizar disponibilidad para reintentar/ }));
    await screen.findByText(/La disponibilidad cambió/);
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(crearReservaConGarantia).toHaveBeenCalledTimes(1);
  });

  it("sin respuesta del servidor no ofrece reintento ni afirma que no se guardó", async () => {
    crearReservaConGarantia.mockRejectedValueOnce(new Error("Network Error"));
    await enviar();
    await screen.findByText(/Revisá el listado de reservas/);
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Actualizar disponibilidad para reintentar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No se guardó nada/)).not.toBeInTheDocument();
  });

  it("bloquea los controles mientras el servidor sigue procesando y acepta el éxito", async () => {
    let resolver;
    crearReservaConGarantia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    await enviar();
    await screen.findByRole("status");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Atrás" })).toBeDisabled();
    expect(screen.getByLabelText("Número de tarjeta *")).toBeDisabled();
    expect(crearReservaConGarantia).toHaveBeenCalledTimes(1);
    await act(async () => resolver(RESERVA_CREADA));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});

describe("ReservaWizard — arranca con habitaciones ya elegidas (desde Disponibilidad interna)", () => {
  it("con habitaciones en valoresIniciales, arranca directo en el paso 2 (ocupación editable) con el paso 1 ya hecho", async () => {
    renderWizard({
      origen: "RECEPCION",
      valoresIniciales: {
        fechaDesde: "2026-10-10",
        fechaHasta: "2026-10-13",
        habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
      },
    });

    // Paso 2 desde el vamos: la habitación ya aparece elegida, con sus
    // campos de ocupación editables — sin haber tocado nada de fechas.
    expect(await screen.findByLabelText("Adultos en habitación 101")).toBeInTheDocument();
    expect(screen.getByText("✓ Fechas de la estadía")).toBeInTheDocument();

    // No queda bloqueado: si hace falta corregir algo, "Atrás" sigue ahí.
    expect(screen.getByRole("button", { name: "Atrás" })).toBeEnabled();
  });

  it("sin habitaciones (autoservicio web de siempre), sigue arrancando en el paso 1", () => {
    renderWizard({ origen: "WEB", valoresIniciales: { fechaDesde: "2026-10-10", fechaHasta: "2026-10-13" } });

    expect(screen.getByLabelText("Entrada (check-in) *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombres*")).not.toBeInTheDocument();
  });
});

describe("ReservaWizard — edición y autoservicio web quedan sin cambios (sin garantía)", () => {
  const RESERVA_EXISTENTE = {
    id: 7,
    fechaDesde: "2026-10-10T00:00:00.000Z",
    fechaHasta: "2026-10-13T00:00:00.000Z",
    habitaciones: [{ id: 1, numero: "101", tipo: "Doble", tipoHabitacionId: 10, adultos: 2, menores: 0 }],
    planTarifarioId: 1,
    planTarifario: { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true },
    huesped: {
      paisDocumento: "AR",
      fechaNacimiento: "1990-01-01",
      nombre: "Ana Pérez",
      nombres: "Ana",
      apellido: "Pérez",
      tipoDocumento: "DNI",
      numeroDocumento: "30111222",
      contacto: "ana@mail.com",
      preferencias: "",
    },
  };

  it("edición: sin 'Garantía', y el paso de huésped confirma directo ('Guardar cambios')", async () => {
    modificarReserva.mockResolvedValue({ ...RESERVA_EXISTENTE });
    const { onExito } = renderWizard({ reserva: RESERVA_EXISTENTE });

    expect(screen.queryByText(/Garantía/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));
    // En edición, la habitación ya viene preseleccionada (estadoInicial toma
    // reserva.habitaciones) — no hay que volver a tocarla: ya aparece en el
    // panel de ocupación editable.
    await screen.findByLabelText("Adultos en habitación 101");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    fireEvent.click(await screen.findByText("Best Available Rate"));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByLabelText("Nombres*");

    const guardar = screen.getByRole("button", { name: "Guardar cambios" });
    fireEvent.click(guardar);

    await waitFor(() => expect(modificarReserva).toHaveBeenCalledTimes(1));
    expect(crearReserva).not.toHaveBeenCalled();
    expect(crearReservaConGarantia).not.toHaveBeenCalled();
    await waitFor(() => expect(onExito).toHaveBeenCalled());
  });

  it("autoservicio web (origen WEB): tampoco pide garantía, y sigue usando el alta simple (HU-40 no se toca)", async () => {
    crearReserva.mockResolvedValue({ ...RESERVA_CREADA, totalEstimadoAlojamiento: 150000 });
    renderWizard({ origen: "WEB" });

    expect(screen.queryByText(/Garantía/)).not.toBeInTheDocument();
    await completarPasos1a4();

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    fireEvent.click(confirmar);

    await waitFor(() => expect(crearReserva).toHaveBeenCalledTimes(1));
    expect(crearReservaConGarantia).not.toHaveBeenCalled();
  });
});

describe("ReservaWizard — HU-89: el filtro de tipo del paso 2 respeta el origen", () => {
  it('origen "WEB" (autoservicio): pide el catálogo con conHabitacionActiva', async () => {
    renderWizard({ origen: "WEB", valoresIniciales: { fechaDesde: "2026-10-10", fechaHasta: "2026-10-13" } });
    await waitFor(() =>
      expect(listarTiposHabitacion).toHaveBeenCalledWith({ activo: "true", conHabitacionActiva: "true" })
    );
  });

  it('origen "RECEPCION" (mostrador): pide todos los tipos activos, sin conHabitacionActiva', async () => {
    renderWizard({ origen: "RECEPCION" });
    await waitFor(() => expect(listarTiposHabitacion).toHaveBeenCalledWith({ activo: "true" }));
  });
});

describe("ReservaWizard — ocupación limitada por la capacidad de la habitación", () => {
  const SIMPLE_102 = { ...HABITACION_101, id: 2, numero: "102", tipo: "Simple", capacidad: 1 };
  const TRIPLE_103 = { ...HABITACION_101, id: 3, numero: "103", tipo: "Triple", capacidad: 3 };

  beforeEach(() => {
    const habitaciones = [HABITACION_101, SIMPLE_102, TRIPLE_103];
    consultarDisponibilidad.mockResolvedValue({
      ...DISPONIBILIDAD,
      habitaciones,
      todas: habitaciones.map((h) => ({ ...h, disponible: true, motivo: null })),
    });
  });

  async function elegir(numero) {
    fireEvent.change(screen.getByLabelText("Entrada (check-in) *"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Salida (check-out) *"), { target: { value: "2026-10-13" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));
    fireEvent.click(await screen.findByText(numero));
  }

  it("una Simple arranca con 1 adulto y 0 menores, muestra la capacidad y no el aviso de exceso", async () => {
    renderWizard({ origen: "RECEPCION" });
    await elegir("102");

    const adultos = screen.getByLabelText("Adultos en habitación 102");
    const menores = screen.getByLabelText("Menores en habitación 102");
    expect(adultos).toHaveValue(1);
    expect(adultos).toHaveAttribute("max", "1");
    expect(menores).toHaveValue(0);
    expect(menores).toHaveAttribute("max", "0");
    expect(screen.getByText("Capacidad máx.: 1")).toBeInTheDocument();
    expect(screen.queryByText(/Supera la capacidad/)).not.toBeInTheDocument();
  });

  it("con capacidad 1 y un adulto, los menores no se pueden subir ni los adultos pasar de 1", async () => {
    renderWizard({ origen: "RECEPCION" });
    await elegir("102");

    fireEvent.change(screen.getByLabelText("Menores en habitación 102"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Adultos en habitación 102"), { target: { value: "3" } });

    expect(screen.getByLabelText("Adultos en habitación 102")).toHaveValue(1);
    expect(screen.getByLabelText("Menores en habitación 102")).toHaveValue(0);
  });

  it("una habitación arranca con tantos adultos como su capacidad, y adultos + menores no la supera", async () => {
    renderWizard({ origen: "RECEPCION" });
    await elegir("103");

    const adultos = () => screen.getByLabelText("Adultos en habitación 103");
    const menores = () => screen.getByLabelText("Menores en habitación 103");
    expect(adultos()).toHaveValue(3);
    expect(menores()).toHaveValue(0);
    expect(menores()).toHaveAttribute("max", "0");
    expect(screen.getByText("Capacidad máx.: 3")).toBeInTheDocument();

    // Bajando adultos se liberan lugares para menores, hasta la capacidad.
    fireEvent.change(adultos(), { target: { value: "1" } });
    fireEvent.change(menores(), { target: { value: "5" } });
    expect(menores()).toHaveValue(2);
    expect(menores()).toHaveAttribute("max", "2");

    // Subir los adultos baja los menores para no pasarse.
    fireEvent.change(adultos(), { target: { value: "3" } });
    expect(adultos()).toHaveValue(3);
    expect(menores()).toHaveValue(0);
  });

  it("habitaciones que llegan ya elegidas se ajustan a su capacidad cuando se conoce", async () => {
    renderWizard({
      origen: "RECEPCION",
      valoresIniciales: {
        fechaDesde: "2026-10-10",
        fechaHasta: "2026-10-13",
        habitaciones: [{ habitacionId: 2, adultos: 2, menores: 1 }],
      },
    });

    await waitFor(() => expect(screen.getByLabelText("Adultos en habitación 102")).toHaveValue(1));
    expect(screen.getByLabelText("Menores en habitación 102")).toHaveValue(0);
    expect(screen.queryByText(/Supera la capacidad/)).not.toBeInTheDocument();
  });
});
