import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MovimientosPagoPage } from "./MovimientosPagoPage";
import { useSesion } from "../../lib/sesion";
import { listarMovimientosPago } from "./pagoEstadia.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("./pagoEstadia.api", () => ({ listarMovimientosPago: vi.fn() }));

const SENIA = {
  id: 1,
  reservaId: 10,
  fecha: "2026-09-20T14:00:00.000Z",
  concepto: "Seña",
  anulado: false,
  motivoAnulacion: null,
  medios: [{ medioPago: "Efectivo", importe: "18000.00" }],
  reserva: { id: 10, codigoConfirmacion: "RS-AAA111", huesped: { id: 1, nombre: "Marcos Beltrán" } },
};

const GARANTIA_ANULADA = {
  id: 2,
  reservaId: 11,
  fecha: "2026-09-18T10:00:00.000Z",
  concepto: "Garantía",
  anulado: true,
  motivoAnulacion: "Cancelación con anticipación (24hs+)",
  medios: [{ medioPago: "Efectivo", importe: "15000.00" }],
  reserva: { id: 11, codigoConfirmacion: "RS-BBB222", huesped: { id: 2, nombre: "Julia Paz" } },
};

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/movimientos-pago"]}>
        <Routes>
          <Route path="/movimientos-pago" element={<MovimientosPagoPage />} />
          <Route path="/reservas/:id" element={<p>Detalle de la reserva</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MovimientosPagoPage", () => {
  it("sin permiso (verPagosEstadia) muestra SinPermiso, no la tabla", async () => {
    useSesion.mockReturnValue({ puede: () => false });
    renderPagina();

    expect(await screen.findByText(/no.*permiso/i)).toBeInTheDocument();
    expect(listarMovimientosPago).not.toHaveBeenCalled();
  });

  it("lista los movimientos con concepto, medio, importe y estado", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([SENIA, GARANTIA_ANULADA]);

    renderPagina();

    expect(await screen.findByText("Marcos Beltrán")).toBeInTheDocument();
    expect(screen.getByText("RS-AAA111")).toBeInTheDocument();
    // "Seña"/"Garantía" también aparecen como <option> del filtro de
    // concepto — alcanza con confirmar que el badge de la fila también está.
    expect(screen.getAllByText("Seña").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Efectivo").length).toBe(2);
    expect(screen.getByText("Vigente")).toBeInTheDocument();

    expect(screen.getByText("Julia Paz")).toBeInTheDocument();
    expect(screen.getAllByText("Garantía").length).toBeGreaterThan(1);
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    expect(screen.getByText("Cancelación con anticipación (24hs+)")).toBeInTheDocument();
  });

  it("sin movimientos muestra un estado vacío, no una tabla en blanco", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([]);

    renderPagina();

    expect(await screen.findByText("Todavía no hay movimientos de pago.")).toBeInTheDocument();
  });

  it("click en una fila navega al Detalle de la reserva correspondiente", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([SENIA]);
    const usuario = userEvent.setup();

    renderPagina();
    await usuario.click(await screen.findByText("RS-AAA111"));

    expect(await screen.findByText("Detalle de la reserva")).toBeInTheDocument();
  });

  it("filtra por concepto", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([SENIA]);
    const usuario = userEvent.setup();

    renderPagina();
    await screen.findByText("Marcos Beltrán");

    const selects = screen.getAllByRole("combobox");
    await usuario.selectOptions(selects[0], "Seña");

    expect(listarMovimientosPago).toHaveBeenLastCalledWith(
      expect.objectContaining({ concepto: "Seña" })
    );
  });
});
