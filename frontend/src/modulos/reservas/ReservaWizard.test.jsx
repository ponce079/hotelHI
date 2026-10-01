import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReservaWizard } from "./ReservaWizard";
import { consultarDisponibilidad, cotizarReserva, crearReserva, crearReservaConSena, modificarReserva } from "./reservas.api";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";
import { listarPlanesTarifarios } from "../tarifas/tarifas.api";

vi.mock("./reservas.api", () => ({
  consultarDisponibilidad: vi.fn(),
  cotizarReserva: vi.fn(),
  crearReserva: vi.fn(),
  crearReservaConSena: vi.fn(),
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

// Completa los pasos 1 a 4 (Fechas, Habitaciones, Plan, Huésped — idénticos
// con o sin seña) y deja el wizard parado justo antes del botón final del
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

  fireEvent.change(await screen.findByLabelText("Nombre y apellido *"), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText("País emisor del documento *"), {target:{value:"AR"}});
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento del titular *"), {target:{value:"1990-01-01"}});
  fireEvent.change(screen.getByLabelText("Número *"), { target: { value: "30111222" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico *"), { target: { value: "ana@mail.com" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  consultarDisponibilidad.mockResolvedValue(DISPONIBILIDAD);
  cotizarReserva.mockResolvedValue(COTIZACION);
  listarPlanesTarifarios.mockResolvedValue([
    { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, activo: true },
  ]);
});

describe("ReservaWizard — alta asistida por mostrador (seña obligatoria, HU-88)", () => {
  it("muestra 5 pasos, con 'Seña' al final, y el paso de huésped avanza en vez de confirmar", async () => {
    renderWizard({ origen: "RECEPCION" });

    expect(screen.getByText(/Seña/)).toBeInTheDocument();
    await completarPasos1a4();

    // Paso de huésped (no es el último): botón "Siguiente", no "Confirmar
    // reserva" — todavía no se mandó nada a la base (ni la reserva ni la
    // seña).
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
    expect(crearReservaConSena).not.toHaveBeenCalled();
  });

  it("paso final: un único submit crea la reserva y cobra la seña en efectivo de forma atómica", async () => {
    crearReservaConSena.mockResolvedValue(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(await screen.findByText("Seña requerida (20%)")).toBeInTheDocument();
    expect(screen.getByText("$ 30.000")).toBeInTheDocument(); // 20% de 150000 (plan BAR cotizado)

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
        habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
        planTarifarioId: 1,
        totalEsperado: 150000,
        origen: "RECEPCION",
        medios: [{ tipo: "Efectivo", importe: 30000, referencia: undefined }],
      })
    );
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
  });

  it("paso final con tarjeta: no deja confirmar hasta autorizar la terminal simulada", async () => {
    renderWizard({ origen: "RECEPCION" });
    await completarPasos1a4();
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

  it("con Transferencia, alcanza con la confirmación manual (sin terminal de tarjeta)", async () => {
    crearReservaConSena.mockResolvedValue(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a4();
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

  it("si el cobro de la seña falla, no queda nada creado — Atrás/Cancelar siguen disponibles y el reintento manda todo de nuevo", async () => {
    crearReservaConSena.mockRejectedValueOnce({ response: { data: { error: "Tarjeta rechazada" } } });
    crearReservaConSena.mockResolvedValueOnce(RESERVA_CREADA);
    const { onExito } = renderWizard({ origen: "RECEPCION" });

    await completarPasos1a4();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Seña requerida (20%)");
    fireEvent.change(screen.getByLabelText("Medio de pago de la seña *"), { target: { value: "Efectivo" } });
    fireEvent.click(screen.getByRole("checkbox"));

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    fireEvent.click(confirmar);
    await waitFor(() => expect(crearReservaConSena).toHaveBeenCalledTimes(1));
    await screen.findByText(/Tarjeta rechazada/);
    expect(screen.queryByText(/No se guardó nada/)).not.toBeInTheDocument();

    // Como nada se persistió (la transacción atómica revirtió todo), el
    // recepcionista puede seguir volviendo atrás o cancelar.
    expect(screen.getByRole("button", { name: "Atrás" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();

    // Reintentar manda TODO de nuevo (reserva + seña), no solo el pago.
    fireEvent.click(confirmar);
    await waitFor(() => expect(crearReservaConSena).toHaveBeenCalledTimes(2));
    expect(crearReservaConSena.mock.calls[1][0]).toMatchObject({
      fechaDesde: "2026-10-10",
      fechaHasta: "2026-10-13",
      habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
    });
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(RESERVA_CREADA));
  });
});

describe("ReservaWizard — vencimiento del guardado", () => {
  async function enviar() {
    renderWizard();
    await completarPasos1a4();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.change(await screen.findByLabelText('Medio de pago de la seña *'), { target: { value: 'Efectivo' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
  }
  const vencido = { response: { status: 408, data: { codigo: 'RESERVA_TIEMPO_AGOTADO', error: 'Se terminó el tiempo de guardado (1 minuto).' } } };

  it('conserva datos, actualiza disponibilidad y permite un segundo intento explícito', async () => {
    crearReservaConSena.mockRejectedValueOnce(vencido).mockResolvedValueOnce(RESERVA_CREADA);
    await enviar();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled();
    const consultas = consultarDisponibilidad.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Actualizar disponibilidad para reintentar/ }));
    await waitFor(() => expect(screen.queryByText(/El intento venció/)).not.toBeInTheDocument());
    expect(consultarDisponibilidad.mock.calls.length).toBeGreaterThan(consultas);
    expect(crearReservaConSena).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByText('Best Available Rate'));
    fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));
    fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    await waitFor(() => expect(crearReservaConSena).toHaveBeenCalledTimes(2));
    expect(crearReservaConSena.mock.calls[1][0]).toEqual(crearReservaConSena.mock.calls[0][0]);
  });

  it('si actualizar falla conserva el bloqueo; si la habitación se ocupó vuelve a selección', async () => {
    crearReservaConSena.mockRejectedValueOnce(vencido);
    await enviar();
    await screen.findByRole('alert');
    consultarDisponibilidad.mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: /Actualizar disponibilidad para reintentar/ }));
    await screen.findByText(/No se pudo actualizar/);
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled();
    consultarDisponibilidad.mockResolvedValueOnce({ ...DISPONIBILIDAD, habitaciones: [], todas: [] });
    fireEvent.click(screen.getByRole('button', { name: /Actualizar disponibilidad para reintentar/ }));
    await screen.findByText(/La disponibilidad cambió/);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(crearReservaConSena).toHaveBeenCalledTimes(1);
  });

  it('sin respuesta del servidor no ofrece reintento ni afirma que no se guardó', async () => {
    crearReservaConSena.mockRejectedValueOnce(new Error('Network Error'));
    await enviar();
    await screen.findByText(/Revisá el listado de reservas/);
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Actualizar disponibilidad para reintentar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No se guardó nada/)).not.toBeInTheDocument();
  });

  it('bloquea los controles mientras el servidor sigue procesando y acepta el éxito', async () => {
    let resolver;
    crearReservaConSena.mockImplementationOnce(() => new Promise((resolve) => { resolver = resolve; }));
    await enviar();
    await screen.findByRole('status');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Atrás' })).toBeDisabled();
    expect(screen.getByLabelText('Medio de pago de la seña *')).toBeDisabled();
    expect(crearReservaConSena).toHaveBeenCalledTimes(1);
    await act(async () => resolver(RESERVA_CREADA));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
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
    expect(screen.queryByLabelText("Nombre y apellido *")).not.toBeInTheDocument();
  });
});

describe("ReservaWizard — edición y autoservicio web quedan sin cambios (sin seña)", () => {
  const RESERVA_EXISTENTE = {
    id: 7,
    fechaDesde: "2026-10-10T00:00:00.000Z",
    fechaHasta: "2026-10-13T00:00:00.000Z",
    habitaciones: [{ id: 1, numero: "101", tipo: "Doble", tipoHabitacionId: 10, adultos: 2, menores: 0 }],
    planTarifarioId: 1,
    planTarifario: { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true },
    huesped: { paisDocumento:"AR", fechaNacimiento:"1990-01-01", nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com", preferencias: "" },
  };

  it("edición: sin 'Seña', y el paso de huésped confirma directo ('Guardar cambios')", async () => {
    modificarReserva.mockResolvedValue({ ...RESERVA_EXISTENTE });
    const { onExito } = renderWizard({ reserva: RESERVA_EXISTENTE });

    expect(screen.queryByText(/Seña/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));
    // En edición, la habitación ya viene preseleccionada (estadoInicial toma
    // reserva.habitaciones) — no hay que volver a tocarla: ya aparece en el
    // panel de ocupación editable.
    await screen.findByLabelText("Adultos en habitación 101");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    fireEvent.click(await screen.findByText("Best Available Rate"));
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
    await completarPasos1a4();

    const confirmar = screen.getByRole("button", { name: "Confirmar reserva" });
    fireEvent.click(confirmar);

    await waitFor(() => expect(crearReserva).toHaveBeenCalledTimes(1));
    expect(crearReservaConSena).not.toHaveBeenCalled();
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
