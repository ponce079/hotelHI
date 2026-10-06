import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NoShowPage } from "./NoShowPage";
import { useSesion } from "../../lib/sesion";
import { listarNoShowPendientes, marcarNoShow, obtenerCierrePrevio } from "./garantias.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("./garantias.api", () => ({
  listarNoShowPendientes: vi.fn(),
  marcarNoShow: vi.fn(),
  obtenerCierrePrevio: vi.fn(),
}));

const RESERVA = {
  id: 12,
  codigoConfirmacion: "RS-NOSHOW",
  estado: "Confirmada",
  fechaDesde: "2026-09-28T00:00:00.000Z",
  fechaHasta: "2026-09-30T00:00:00.000Z",
  huesped: { nombre: "Laura Gómez", tipoDocumento: "DNI", numeroDocumento: "30111222" },
  habitaciones: [{ id: 1, numero: "201" }],
  planTarifario: { nombre: "Best Available Rate" },
};
const CIERRE = {
  tipo: "NO_SHOW",
  regla: "PRIMERA_NOCHE",
  monto: 45000,
  retenido: 0,
  devuelto: 0,
  aCobrarATarjeta: 45000,
  sinCobrar: 0,
  tarjeta: { marca: "Visa", ultimos4: "4242" },
  estadoCobro: "COBRADO",
};

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NoShowPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue({ puede: () => true });
  listarNoShowPendientes.mockResolvedValue([RESERVA]);
  obtenerCierrePrevio.mockResolvedValue(CIERRE);
});

describe("NoShowPage — llegadas no presentadas", () => {
  it("sin permiso de gestionar reservas, no muestra nada ni consulta el backend", () => {
    useSesion.mockReturnValue({ puede: () => false });
    renderPagina();
    expect(listarNoShowPendientes).not.toHaveBeenCalled();
    expect(screen.queryByText("Llegadas no presentadas")).not.toBeInTheDocument();
  });

  it("lista las reservas confirmadas con la llegada vencida", async () => {
    renderPagina();
    expect(await screen.findByText("RS-NOSHOW")).toBeInTheDocument();
    expect(screen.getByText("Laura Gómez")).toBeInTheDocument();
    expect(screen.getByText("201")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcar no-show/ })).toBeInTheDocument();
  });

  it("sin pendientes, lo dice", async () => {
    listarNoShowPendientes.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText("No hay llegadas pendientes de marcar.")).toBeInTheDocument();
  });

  it("antes de confirmar muestra cuánto se cobra y a qué tarjeta", async () => {
    renderPagina();
    await userEvent.setup().click(await screen.findByRole("button", { name: /Marcar no-show/ }));

    expect(await screen.findByText(/Penalidad: \$ ?45\.000 — se cobra la primera noche\./)).toBeInTheDocument();
    expect(screen.getByText(/Se cobran \$ ?45\.000 a Visa \*\*\*\*4242\./)).toBeInTheDocument();
    expect(obtenerCierrePrevio).toHaveBeenCalledWith(12, "NO_SHOW");
    expect(marcarNoShow).not.toHaveBeenCalled(); // todavía no se confirmó
  });

  it("al confirmar, marca el no-show (con la observación) y muestra el resultado del cobro", async () => {
    marcarNoShow.mockResolvedValue({
      ...RESERVA,
      estado: "No-show",
      penalidad: { mensaje: "Se cobraron $ 45.000 a Visa ****4242." },
    });
    renderPagina();
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: /Marcar no-show/ }));
    await screen.findByText(/Penalidad:/);

    await usuario.type(screen.getByPlaceholderText("Ej.: avisó que no viajaba"), "Avisó que no viajaba");
    await usuario.click(screen.getByRole("button", { name: "Sí, marcar no-show" }));

    await waitFor(() => expect(marcarNoShow).toHaveBeenCalledWith(12, "Avisó que no viajaba"));
    expect(await screen.findByText(/marcada como no-show\. Se cobraron/)).toBeInTheDocument();
  });

  it("si el backend rechaza (ej. la llegada todavía no pasó), muestra el motivo", async () => {
    marcarNoShow.mockRejectedValue({ response: { data: { error: "Todavía no corresponde marcar no-show: la fecha de llegada no pasó." } } });
    renderPagina();
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: /Marcar no-show/ }));
    await screen.findByText(/Penalidad:/);
    await usuario.click(screen.getByRole("button", { name: "Sí, marcar no-show" }));

    expect(await screen.findByText(/Todavía no corresponde marcar no-show/)).toBeInTheDocument();
  });
});
