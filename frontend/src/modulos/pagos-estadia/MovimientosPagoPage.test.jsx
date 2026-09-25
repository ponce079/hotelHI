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

const RESERVA_10 = {
  id: 10,
  codigoConfirmacion: "RS-AAA111",
  fechaDesde: "2026-10-01T00:00:00.000Z",
  fechaHasta: "2026-10-05T00:00:00.000Z",
  estado: "En curso",
  huesped: { id: 1, nombre: "Marcos Beltrán" },
  habitaciones: [{ id: 1, numero: "101" }],
};

const RESERVA_11 = {
  id: 11,
  codigoConfirmacion: "RS-BBB222",
  fechaDesde: "2026-09-25T00:00:00.000Z",
  fechaHasta: "2026-09-27T00:00:00.000Z",
  estado: "Cancelada",
  huesped: { id: 2, nombre: "Julia Paz" },
  habitaciones: [{ id: 2, numero: "205" }],
};

const SENIA = {
  id: 1,
  reservaId: 10,
  fecha: "2026-09-20T14:00:00.000Z",
  concepto: "Seña",
  anulado: false,
  motivoAnulacion: null,
  medios: [{ medioPago: "Efectivo", importe: "18000.00" }],
  reserva: RESERVA_10,
};

// Misma reserva que SENIA (reservaId 10), movimiento más nuevo — para
// probar que se agrupan en el mismo bloque (celda "Reserva" con rowSpan) y
// que el orden de los grupos va por el movimiento más reciente de cada
// reserva.
const PAGO_FINAL_MISMA_RESERVA = {
  id: 3,
  reservaId: 10,
  fecha: "2026-09-22T09:00:00.000Z",
  concepto: "Pago final",
  anulado: false,
  motivoAnulacion: null,
  medios: [{ medioPago: "Tarjeta débito", importe: "42000.00" }],
  reserva: RESERVA_10,
};

const GARANTIA_ANULADA = {
  id: 2,
  reservaId: 11,
  fecha: "2026-09-18T10:00:00.000Z",
  concepto: "Garantía",
  anulado: true,
  motivoAnulacion: "Cancelación con anticipación (24hs+)",
  medios: [{ medioPago: "Efectivo", importe: "15000.00" }],
  reserva: RESERVA_11,
};

// Genera `n` movimientos de reservas todas distintas (una Seña cada una),
// con fechas decrecientes para que el orden de los grupos sea predecible
// (reserva 0 = movimiento más reciente = primera en la tabla) — usado para
// probar la paginación, que corta por reserva, no por movimiento.
function crearMovimientos(n) {
  return Array.from({ length: n }, (_, i) => {
    const reserva = {
      id: 100 + i,
      codigoConfirmacion: `RS-PAG-${String(i).padStart(3, "0")}`,
      fechaDesde: "2026-10-01T00:00:00.000Z",
      fechaHasta: "2026-10-05T00:00:00.000Z",
      estado: "Confirmada",
      huesped: { id: 100 + i, nombre: `Huésped ${i}` },
      habitaciones: [{ id: 100 + i, numero: String(100 + i) }],
    };
    return {
      id: 100 + i,
      reservaId: reserva.id,
      fecha: new Date(2026, 8, 20, 0, 0, n - i).toISOString(),
      concepto: "Seña",
      anulado: false,
      motivoAnulacion: null,
      medios: [{ medioPago: "Efectivo", importe: "1000.00" }],
      reserva,
    };
  });
}

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

  it("agrupa los movimientos de una misma reserva bajo una sola celda (rowSpan), ordenados por el más reciente arriba", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([SENIA, PAGO_FINAL_MISMA_RESERVA, GARANTIA_ANULADA]);

    const { container } = renderPagina();

    expect(await screen.findByText("Marcos Beltrán")).toBeInTheDocument();
    // El código/huésped/habitación de la reserva 10 aparecen una sola vez,
    // aunque tenga dos movimientos — es la celda con rowSpan, no una fila
    // repetida por movimiento.
    expect(screen.getAllByText("RS-AAA111")).toHaveLength(1);
    const celdaReserva10 = screen.getByText("RS-AAA111").closest("td");
    expect(celdaReserva10).toHaveAttribute("rowspan", "2");
    expect(celdaReserva10).toHaveTextContent("Hab. 101");

    expect(screen.getAllByText("Seña").length).toBeGreaterThan(1); // + <option>
    expect(screen.getAllByText("Pago final").length).toBeGreaterThan(1); // + <option>

    expect(screen.getByText("Julia Paz")).toBeInTheDocument();
    // Reserva 11 tiene un solo movimiento: rowSpan=1, como una fila normal.
    const celdaReserva11 = screen.getByText("RS-BBB222").closest("td");
    expect(celdaReserva11).toHaveAttribute("rowspan", "1");

    expect(screen.getByText("Anulado")).toBeInTheDocument();
    expect(screen.getAllByText("Vigente")).toHaveLength(2);

    // Orden por movimiento más reciente: reserva 10 (09-22) arriba de la
    // reserva 11 (09-18).
    const posicion10 = container.innerHTML.indexOf("RS-AAA111");
    const posicion11 = container.innerHTML.indexOf("RS-BBB222");
    expect(posicion10).toBeGreaterThan(-1);
    expect(posicion11).toBeGreaterThan(posicion10);
  });

  it("un movimiento anulado muestra el importe tachado y el badge Anulado en tono error", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([GARANTIA_ANULADA]);

    renderPagina();

    const badgeAnulado = await screen.findByText("Anulado");
    expect(badgeAnulado.className).toMatch(/error/);

    const importe = screen.getByText(/15\.000,00/);
    expect(importe.className).toContain("line-through");
  });

  it("sin movimientos muestra un estado vacío, no una tabla en blanco", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([]);

    renderPagina();

    expect(await screen.findByText("Todavía no hay movimientos de pago.")).toBeInTheDocument();
  });

  it("click en la fila navega al Detalle de la reserva correspondiente", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([SENIA]);
    const usuario = userEvent.setup();

    renderPagina();
    await usuario.click(await screen.findByText("RS-AAA111"));

    expect(await screen.findByText("Detalle de la reserva")).toBeInTheDocument();
  });

  it("filtrar por concepto muestra el grupo completo de la reserva, no solo el movimiento que matchea", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue([SENIA, PAGO_FINAL_MISMA_RESERVA, GARANTIA_ANULADA]);
    const usuario = userEvent.setup();

    renderPagina();
    await screen.findByText("Marcos Beltrán");

    const selects = screen.getAllByRole("combobox");
    await usuario.selectOptions(selects[0], "Seña");

    // La reserva 10 tiene un movimiento de Seña: se mantiene, y con TODO su
    // contexto (también se ve el Pago final de esa misma reserva).
    expect(screen.getByText("RS-AAA111")).toBeInTheDocument();
    expect(screen.getAllByText("Pago final").length).toBeGreaterThan(0);

    // La reserva 11 no tiene ningún movimiento de Seña: desaparece entera.
    expect(screen.queryByText("RS-BBB222")).not.toBeInTheDocument();

    // El filtro de concepto se resuelve en el cliente (necesita ver TODOS
    // los movimientos para poder armar el contexto completo de cada
    // reserva) — no dispara un nuevo pedido al backend.
    expect(listarMovimientosPago).toHaveBeenCalledTimes(1);
    expect(listarMovimientosPago).toHaveBeenCalledWith({ q: undefined });
  });

  it("una reserva sin Pago final todavía NO muestra ninguna fila fantasma — mismo criterio que alertas en cero", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    // RESERVA_10 está "En curso" y acá solo tiene la Seña — sin Pago final
    // registrado todavía. No hay que fabricar una fila placeholder para eso:
    // el pago final va a aparecer solo, como cualquier otro movimiento real,
    // cuando de verdad se registre.
    listarMovimientosPago.mockResolvedValue([SENIA]);

    renderPagina();

    expect(await screen.findByText("Marcos Beltrán")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente (check-out)")).not.toBeInTheDocument();
    // Un solo movimiento real: rowSpan=1, sin fila extra debajo.
    const celdaReserva = screen.getByText("RS-AAA111").closest("td");
    expect(celdaReserva).toHaveAttribute("rowspan", "1");
  });

  it("con más de 10 reservas, pagina de a 10 sin cortar ningún grupo a la mitad", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue(crearMovimientos(12));
    const usuario = userEvent.setup();

    renderPagina();

    // Página 1: las 10 reservas más recientes (0 a 9), no las dos más viejas.
    expect(await screen.findByText("RS-PAG-000")).toBeInTheDocument();
    expect(screen.getByText("RS-PAG-009")).toBeInTheDocument();
    expect(screen.queryByText("RS-PAG-010")).not.toBeInTheDocument();
    expect(screen.queryByText("RS-PAG-011")).not.toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();

    await usuario.click(screen.getByText("Siguiente"));

    // Página 2: las 2 reservas restantes, ninguna de la página 1.
    expect(await screen.findByText("RS-PAG-010")).toBeInTheDocument();
    expect(screen.getByText("RS-PAG-011")).toBeInTheDocument();
    expect(screen.queryByText("RS-PAG-000")).not.toBeInTheDocument();
    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
  });

  it("cambiar un filtro vuelve a la página 1", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue(crearMovimientos(12));
    const usuario = userEvent.setup();

    renderPagina();

    await usuario.click(await screen.findByText("Siguiente"));
    expect(await screen.findByText("RS-PAG-010")).toBeInTheDocument();

    // Filtrar por huésped: como todos los movimientos son "Seña", el select
    // de concepto no achica nada, pero sí dispara el reset de página.
    const selects = screen.getAllByRole("combobox");
    await usuario.selectOptions(selects[0], "Seña");

    expect(await screen.findByText("RS-PAG-000")).toBeInTheDocument();
    expect(screen.queryByText("RS-PAG-010")).not.toBeInTheDocument();
  });

  it("con 10 reservas o menos no muestra el control de paginación", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    listarMovimientosPago.mockResolvedValue(crearMovimientos(10));

    renderPagina();

    expect(await screen.findByText("RS-PAG-000")).toBeInTheDocument();
    expect(screen.queryByText(/Página \d+ de \d+/)).not.toBeInTheDocument();
  });
});
