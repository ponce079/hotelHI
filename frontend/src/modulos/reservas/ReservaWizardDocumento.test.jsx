import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReservaWizard } from "./ReservaWizard";
import { consultarDisponibilidad, cotizarReserva } from "./reservas.api";
import { listarPlanesTarifarios } from "../tarifas/tarifas.api";
import { buscarHuespedPorDocumento } from "../check-in/checkIn.api";

vi.mock("./reservas.api", () => ({
  consultarDisponibilidad: vi.fn(),
  cotizarReserva: vi.fn(),
  crearReserva: vi.fn(),
  crearReservaConSena: vi.fn(),
  modificarReserva: vi.fn(),
}));
vi.mock("../tipos-habitacion/tiposHabitacion.api", () => ({
  listarTiposHabitacion: vi.fn().mockResolvedValue([{ id: 10, codigo: "DOBLE", nombre: "Doble", activo: true }]),
}));
vi.mock("../tarifas/tarifas.api", () => ({ listarPlanesTarifarios: vi.fn() }));
vi.mock("../check-in/checkIn.api", () => ({ buscarHuespedPorDocumento: vi.fn() }));

let mockRol = "recepcionista";
vi.mock("../../lib/sesion", () => ({ useSesionOpcional: () => (mockRol ? { rol: mockRol } : null) }));

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

async function irAlPasoHuesped() {
  fireEvent.change(screen.getByLabelText("Entrada (check-in) *"), { target: { value: "2026-10-10" } });
  fireEvent.change(screen.getByLabelText("Salida (check-out) *"), { target: { value: "2026-10-13" } });
  await waitFor(() => expect(screen.getByRole("button", { name: /Ver disponibilidad/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /Ver disponibilidad/ }));
  fireEvent.click(await screen.findByText("101"));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  fireEvent.click(await screen.findByText("Best Available Rate"));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await screen.findByLabelText("Nombres*");
}

function cargarDocumento(numero) {
  fireEvent.change(screen.getByLabelText("País emisor*"), { target: { value: "AR" } });
  fireEvent.change(screen.getByLabelText("Número*"), { target: { value: numero } });
}

const FICHA = {
  nombreRegistrado: { nombres: "Juan", apellido: "Pérez" },
  nombre: "Juan",
  apellido: "Pérez",
  fechaNacimiento: "1985-03-02",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRol = "recepcionista";
  consultarDisponibilidad.mockResolvedValue(DISPONIBILIDAD);
  cotizarReserva.mockResolvedValue(COTIZACION);
  listarPlanesTarifarios.mockResolvedValue([
    { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, activo: true },
  ]);
});

describe("ReservaWizard — documento único: el nombre sale de la ficha", () => {
  it("si el documento ya existe, completa el nombre y lo bloquea (recepcionista sin opción de corregir)", async () => {
    buscarHuespedPorDocumento.mockResolvedValue(FICHA);
    renderWizard({ origen: "RECEPCION" });
    await irAlPasoHuesped();
    cargarDocumento("45.112.902");

    await waitFor(() => expect(screen.getByLabelText("Nombres*")).toHaveValue("Juan"));
    expect(screen.getByLabelText("Apellido*")).toHaveValue("Pérez");
    expect(screen.getByLabelText("Nombres*")).toBeDisabled();
    expect(screen.getByLabelText("Apellido*")).toBeDisabled();
    expect(screen.getByLabelText("Nacimiento*")).toHaveValue("1985-03-02");
    expect(screen.queryByRole("button", { name: "Corregir nombre" })).not.toBeInTheDocument();
    // Se busca con el número tal cual lo tipeó el recepcionista pero sin puntos.
    expect(buscarHuespedPorDocumento).toHaveBeenCalledWith({ tipo: "DNI", pais: "AR", numero: "45112902" });
  });

  it("el administrador puede corregir el nombre", async () => {
    mockRol = "admin";
    buscarHuespedPorDocumento.mockResolvedValue(FICHA);
    renderWizard({ origen: "RECEPCION" });
    await irAlPasoHuesped();
    cargarDocumento("45112902");

    await waitFor(() => expect(screen.getByLabelText("Nombres*")).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Corregir nombre" }));
    expect(screen.getByLabelText("Nombres*")).toBeEnabled();
    expect(screen.getByLabelText("Apellido*")).toBeEnabled();
  });

  it("ficha que solo tenía teléfono y se carga un correo: se avisa la diferencia (no se descarta en silencio) y la casilla empieza sin tildar", async () => {
    buscarHuespedPorDocumento.mockResolvedValue({ ...FICHA, telefono: "3875550001" });
    renderWizard({ origen: "RECEPCION" });
    await irAlPasoHuesped();
    cargarDocumento("45112902");
    await waitFor(() => expect(screen.getByLabelText(/Correo/)).toHaveValue("3875550001"));
    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: "nuevo@correo.com" } });
    expect(await screen.findByText(/Cambiaste datos respecto de la ficha del huésped: contacto\./)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" })).not.toBeChecked();
  });

  it("documento nuevo (404): el recepcionista carga el nombre", async () => {
    buscarHuespedPorDocumento.mockRejectedValue({ response: { status: 404 } });
    renderWizard({ origen: "RECEPCION" });
    await irAlPasoHuesped();
    cargarDocumento("45112902");

    expect(await screen.findByText(/No hay un huésped registrado con ese documento/)).toBeInTheDocument();
    expect(screen.getByLabelText("Nombres*")).toBeEnabled();
  });

  it("dato cambiado respecto de la ficha: aviso y casilla sin tildar; se manda actualizarFicha solo si se tilda", async () => {
    buscarHuespedPorDocumento.mockResolvedValue({ ...FICHA, email: "juan@correo.com", fechaUltimaEstadia: "2026-09-20" });
    renderWizard({ origen: "RECEPCION" });
    await irAlPasoHuesped();
    cargarDocumento("45112902");
    await waitFor(() => expect(screen.getByLabelText("Nombres*")).toHaveValue("Juan"));
    expect(screen.getByText(/Huésped registrado · última estadía: 20\/09\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: "otro@correo.com" } });
    const casilla = await screen.findByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" });
    expect(casilla).not.toBeChecked();
  });

  it("si cambia el documento, el nombre autocompletado del anterior se limpia", async () => {
    buscarHuespedPorDocumento.mockResolvedValueOnce(FICHA).mockRejectedValue({ response: { status: 404 } });
    renderWizard({ origen: "RECEPCION" });
    await irAlPasoHuesped();
    cargarDocumento("45112902");
    await waitFor(() => expect(screen.getByLabelText("Nombres*")).toHaveValue("Juan"));

    fireEvent.change(screen.getByLabelText("Número*"), { target: { value: "45112903" } });
    await waitFor(() => expect(screen.getByLabelText("Nombres*")).toHaveValue(""));
    expect(screen.getByLabelText("Nombres*")).toBeEnabled();
  });

  it("la reserva web (sin sesión) no consulta fichas de otros huéspedes", async () => {
    mockRol = null;
    renderWizard({ origen: "WEB" });
    await irAlPasoHuesped();
    cargarDocumento("45112902");

    await new Promise((r) => setTimeout(r, 700));
    expect(buscarHuespedPorDocumento).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombres*")).toBeEnabled();
  });
});
