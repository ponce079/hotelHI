import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ComprobanteEstadiaDetallePage } from "./ComprobanteEstadiaDetallePage";
import { obtenerComprobante } from "./comprobanteEstadia.api";

vi.mock("../../lib/sesion", () => ({
  useSesion: () => ({ puede: () => true }),
}));
vi.mock("./comprobanteEstadia.api", () => ({ obtenerComprobante: vi.fn(), anularComprobante: vi.fn() }));
vi.mock("./NotaCreditoModal", () => ({ NotaCreditoModal: () => null }));

const BASE = {
  id: 1,
  reservaId: 7,
  tipo: "Comprobante",
  numero: "CE-00001",
  fecha: "2026-10-06T15:00:00.000Z",
  importeNeto: "90909.09",
  alicuotaIVA: "21",
  importeIVA: "19090.91",
  importeTotal: "110000.00",
  anulado: false,
  ajustes: [],
  reserva: { codigoConfirmacion: "RS-X", fechaDesde: "2026-10-04T00:00:00.000Z", fechaHasta: "2026-10-06T00:00:00.000Z", huesped: { nombre: "Ana Pérez" } },
};

const DETALLE = {
  lineas: [
    { categoria: "Alojamiento", concepto: "Habitación 101 (Doble)", cantidad: 2, unidad: "noches", precioUnitario: 50000, importe: 100000 },
    { categoria: "Cargos adicionales", concepto: "Minibar", habitacion: "101", fecha: "2026-10-05T12:00:00Z", cantidad: 2, importe: 3000 },
    { categoria: "Cargos adicionales", concepto: "Lavandería", habitacion: "101", fecha: "2026-10-05T15:00:00Z", cantidad: null, importe: 4500 },
    { categoria: "Verificación de la habitación", concepto: "Daño en la habitación", descripcion: "Toalla manchada", habitacion: "101", fecha: "2026-10-06T10:00:00Z", importe: 2500 },
  ],
  total: 110000,
  coincide: true,
};

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/comprobantes-estadia/1"]}>
        <Routes>
          <Route path="/comprobantes-estadia/:id" element={<ComprobanteEstadiaDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ComprobanteEstadiaDetallePage — detalle de cargos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista el alojamiento y cada cargo adicional con su importe", async () => {
    obtenerComprobante.mockResolvedValue({ ...BASE, detalle: DETALLE });
    renderizar();
    const detalle = await screen.findByTestId("detalle-comprobante");
    expect(within(detalle).getByText(/Habitación 101 \(Doble\)/)).toBeInTheDocument();
    expect(within(detalle).getByText("Cargos adicionales")).toBeInTheDocument();
    expect(within(detalle).getByText("Minibar")).toBeInTheDocument();
    expect(within(detalle).getByText("Lavandería")).toBeInTheDocument();
    expect(within(detalle).getByText("Daño en la habitación")).toBeInTheDocument();
    expect(within(detalle).getByText("Toalla manchada")).toBeInTheDocument();
    expect(within(detalle).getByText(/Subtotal cargos adicionales/)).toBeInTheDocument();
  });

  it("sin detalle (comprobante viejo) no muestra la sección y sigue mostrando el total", async () => {
    obtenerComprobante.mockResolvedValue({ ...BASE, detalle: null });
    renderizar();
    expect(await screen.findByText("CE-00001", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByTestId("detalle-comprobante")).not.toBeInTheDocument();
  });

  it("encabezado con los datos del hotel (sin CUIT inventado), medios de pago y la leyenda de comprobante interno", async () => {
    obtenerComprobante.mockResolvedValue({
      ...BASE,
      detalle: DETALLE,
      mediosDePago: [{ concepto: "Pago de estadía", medioPago: "Tarjeta crédito", importe: 110000, referencia: "Visa ****4242" }],
      reserva: { ...BASE.reserva, estado: "Cerrada" },
    });
    renderizar();
    await screen.findByTestId("detalle-comprobante");
    expect(screen.getByText("Holiday Inn")).toBeInTheDocument();
    expect(screen.getByText("Hotel de demostración")).toBeInTheDocument();
    expect(screen.getByText("CUIT: no aplica — proyecto académico")).toBeInTheDocument();
    expect(screen.getByText(/Av\. Bicentenario de la Batalla de Salta 1250/)).toBeInTheDocument();
    expect(screen.getByText("Medios de pago")).toBeInTheDocument();
    expect(screen.getByText(/Tarjeta crédito/)).toBeInTheDocument();
    expect(screen.getByText(/Comprobante interno\. No válido como factura\./)).toBeInTheDocument();
    expect(screen.queryByText(/Comprobante provisorio/)).not.toBeInTheDocument();
  });

  it("antes del check-out (reserva sin cerrar) el comprobante es provisorio", async () => {
    obtenerComprobante.mockResolvedValue({ ...BASE, detalle: DETALLE, mediosDePago: [], reserva: { ...BASE.reserva, estado: "En curso" } });
    renderizar();
    await screen.findByTestId("detalle-comprobante");
    expect(screen.getAllByText(/Comprobante provisorio/).length).toBeGreaterThan(0);
  });

  it("la nota de crédito no muestra detalle", async () => {
    obtenerComprobante.mockResolvedValue({ ...BASE, tipo: "Nota de Crédito", motivo: "x", detalle: null });
    renderizar();
    await screen.findAllByText("Nota de crédito");
    expect(screen.queryByTestId("detalle-comprobante")).not.toBeInTheDocument();
  });
});
