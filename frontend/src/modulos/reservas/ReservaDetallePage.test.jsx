import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { ReservaDetallePage } from "./ReservaDetallePage";
import { useSesion } from "../../lib/sesion";
import { obtenerReserva } from "./reservas.api";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarPagosEstadia } from "../pagos-estadia/pagoEstadia.api";
import { obtenerResumenPorReserva } from "../servicios-adicionales/serviciosAdicionales.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("./reservas.api", () => ({ obtenerReserva: vi.fn(), cancelarReserva: vi.fn() }));
vi.mock("../check-in/checkIn.api", () => ({ buscarReservaParaCheckIn: vi.fn() }));
vi.mock("../pagos-estadia/pagoEstadia.api", () => ({ listarPagosEstadia: vi.fn() }));
vi.mock("../servicios-adicionales/serviciosAdicionales.api", () => ({ obtenerResumenPorReserva: vi.fn() }));

const RESERVA_BASE = {
  id: 5,
  codigoConfirmacion: "RS-DET01",
  estado: "Confirmada",
  motivoCancelacion: null,
  fechaDesde: "2026-09-20T00:00:00.000Z",
  fechaHasta: "2026-09-23T00:00:00.000Z",
  noches: 3,
  totalEstimadoAlojamiento: 90000,
  cantidadHabitaciones: 1,
  huesped: { nombre: "Marcos Beltrán", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "", preferencias: "" },
  habitaciones: [{ id: 1, numero: "301", tipo: "Doble", tipoHabitacionId: 10, capacidad: 2, piso: 3, estado: "libre", tarifaPorNoche: 30000 }],
  notificaciones: [],
};

function CheckInStub() {
  const [params] = useSearchParams();
  return <p>Check-in codigo={params.get("codigo") ?? ""}</p>;
}

function renderDetalle() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/reservas/5"]}>
        <Routes>
          <Route path="/reservas/:id" element={<ReservaDetallePage />} />
          <Route path="/check-in" element={<CheckInStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue({ rol: "recepcionista", puede: () => true });
  obtenerResumenPorReserva.mockResolvedValue({ totalGeneral: 0, totalPorTipo: [], items: [] });
  listarPagosEstadia.mockResolvedValue({ pagos: [], totalAdeudado: 0, totalPagado: 0, saldo: 0 });
});

// La misma info (puedeIniciarCheckIn/motivoBloqueo) que ya calcula
// validarReservaVigente en checkIn.servicio.js (backend) — el frontend no
// reimplementa la comparación de fechas, solo reusa este endpoint.
describe("ReservaDetallePage — botón Iniciar check-in", () => {
  it("Confirmada con fecha de ingreso ya llegada: botón habilitado y lleva a Check-in con esa reserva", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA_BASE, puedeIniciarCheckIn: true, motivoBloqueo: null });

    renderDetalle();

    const boton = await screen.findByRole("button", { name: /Iniciar check-in/ });
    await waitFor(() => expect(boton).toBeEnabled());

    await userEvent.setup().click(boton);
    expect(await screen.findByText(`Check-in codigo=${RESERVA_BASE.codigoConfirmacion}`)).toBeInTheDocument();
  });

  it("Confirmada con fecha de ingreso futura: botón deshabilitado con el motivo real del backend", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    const motivo = 'El check-in habilita a partir del 25/09/2026 (fecha de ingreso de la reserva).';
    buscarReservaParaCheckIn.mockResolvedValue({ reserva: RESERVA_BASE, puedeIniciarCheckIn: false, motivoBloqueo: motivo });

    renderDetalle();

    const boton = await screen.findByRole("button", { name: /Iniciar check-in/ });
    expect(boton).toBeDisabled();
    expect(await screen.findByText(motivo)).toBeInTheDocument();
  });

  it('reserva "En curso": el botón no se muestra (no es un tema de fecha, es de estado)', async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });

    renderDetalle();

    await screen.findByText(RESERVA_BASE.huesped.nombre);
    expect(screen.queryByRole("button", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });

  it('reserva "Cancelada": el botón no se muestra', async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cancelada", motivoCancelacion: "El huésped se arrepintió" });

    renderDetalle();

    await screen.findByText(RESERVA_BASE.huesped.nombre);
    expect(screen.queryByRole("button", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });
});

// HU-37 — antes de confirmar la cancelación, el diálogo tiene que avisar
// explícitamente qué pasa con la seña según la política de 24hs (reusa el
// mismo umbral que cancelarReserva en el backend: MILISEGUNDOS_POR_DIA).
describe("ReservaDetallePage — aviso de la seña al cancelar", () => {
  function reservaConFechaDesde(horasHastaIngreso) {
    return {
      ...RESERVA_BASE,
      fechaDesde: new Date(Date.now() + horasHastaIngreso * 60 * 60 * 1000).toISOString(),
    };
  }

  const SENIA_VIGENTE = {
    id: 30,
    concepto: "Seña",
    anulado: false,
    medios: [{ medioPago: "Efectivo", importe: "18000.00" }],
  };

  async function abrirDialogoCancelar() {
    const boton = await screen.findByRole("button", { name: "Cancelar reserva" });
    await userEvent.setup().click(boton);
  }

  it("24hs o más de anticipación: avisa que la seña se devuelve", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(48));
    listarPagosEstadia.mockResolvedValue({ pagos: [SENIA_VIGENTE], totalAdeudado: 90000, totalPagado: 18000, saldo: 72000 });

    renderDetalle();
    await abrirDialogoCancelar();

    expect(await screen.findByText(/Se cancela con más de 24hs de anticipación — la seña de \$ ?18\.000 va a devolverse\./)).toBeInTheDocument();
  });

  it("menos de 24hs de anticipación: avisa que la seña NO se devuelve", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(5));
    listarPagosEstadia.mockResolvedValue({ pagos: [SENIA_VIGENTE], totalAdeudado: 90000, totalPagado: 18000, saldo: 72000 });

    renderDetalle();
    await abrirDialogoCancelar();

    expect(await screen.findByText(/Se cancela con menos de 24hs de anticipación — la seña de \$ ?18\.000 no se devuelve\./)).toBeInTheDocument();
  });

  it("sin ninguna seña vigente, no muestra ningún aviso", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(48));
    listarPagosEstadia.mockResolvedValue({ pagos: [], totalAdeudado: 90000, totalPagado: 0, saldo: 90000 });

    renderDetalle();
    await abrirDialogoCancelar();

    expect(await screen.findByText("Motivo de la cancelación *")).toBeInTheDocument();
    expect(screen.queryByText(/la seña de/)).not.toBeInTheDocument();
  });

  it("una seña ya anulada no dispara el aviso (no hay nada nuevo que decidir)", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(48));
    listarPagosEstadia.mockResolvedValue({
      pagos: [{ ...SENIA_VIGENTE, anulado: true }],
      totalAdeudado: 90000,
      totalPagado: 0,
      saldo: 90000,
    });

    renderDetalle();
    await abrirDialogoCancelar();

    expect(await screen.findByText("Motivo de la cancelación *")).toBeInTheDocument();
    expect(screen.queryByText(/la seña de/)).not.toBeInTheDocument();
  });
});

// Desglose de pago en la tarjeta "Estadía" — reusa el mismo
// totalAdeudado/totalPagado/saldo que ya calcula consolidarCargos
// (check-out) vía calcularSaldoReserva, expuesto acá por
// listarPagosEstadia; no se reimplementa ninguna cuenta en el frontend.
describe("ReservaDetallePage — desglose de pago (seña / saldo pendiente)", () => {
  it("con seña pagada: muestra monto + medio, linkeado a Movimientos de Pago, y el saldo real pendiente", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    listarPagosEstadia.mockResolvedValue({
      pagos: [
        {
          id: 30,
          concepto: "Seña",
          anulado: false,
          medios: [{ medioPago: "Efectivo", importe: "9000.00" }],
        },
      ],
      totalAdeudado: 90000,
      totalPagado: 9000,
      saldo: 81000,
    });

    renderDetalle();

    expect(await screen.findByText("Seña pagada")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /9\.000.*Efectivo/ });
    expect(link).toHaveAttribute("href", `/movimientos-pago?q=${RESERVA_BASE.codigoConfirmacion}`);

    expect(screen.getByText("Saldo pendiente")).toBeInTheDocument();
    expect(screen.getByText("$ 81.000")).toBeInTheDocument();
  });

  it("sin ningún PagoEstadia: no muestra 'Seña pagada' y el saldo pendiente es el total completo", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    listarPagosEstadia.mockResolvedValue({ pagos: [], totalAdeudado: 90000, totalPagado: 0, saldo: 90000 });

    renderDetalle();

    await screen.findByText("Saldo pendiente");
    expect(screen.queryByText("Seña pagada")).not.toBeInTheDocument();
    // "Total estimado" y "Saldo pendiente" muestran el mismo monto acá
    // (nada pagado todavía) — las dos apariciones son el comportamiento
    // esperado, no una sola.
    expect(screen.getAllByText("$ 90.000")).toHaveLength(2);
  });

  it("sin permiso verPagosEstadia: no muestra el desglose ni pide los pagos", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", puede: (accion) => accion !== "verPagosEstadia" });
    obtenerReserva.mockResolvedValue(RESERVA_BASE);

    renderDetalle();

    await screen.findByText(RESERVA_BASE.huesped.nombre);
    expect(screen.queryByText("Seña pagada")).not.toBeInTheDocument();
    expect(screen.queryByText("Saldo pendiente")).not.toBeInTheDocument();
    expect(listarPagosEstadia).not.toHaveBeenCalled();
  });
});
