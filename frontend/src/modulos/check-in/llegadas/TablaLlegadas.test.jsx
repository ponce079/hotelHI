import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TablaLlegadas, textoSenia } from "./TablaLlegadas";

const BASE = {
  id: 1,
  codigoConfirmacion: "AAA111",
  fechaDesde: "2099-10-10T00:00:00.000Z",
  fechaHasta: "2099-10-13T00:00:00.000Z",
  noches: 3,
  titular: { nombre: "Ana Pérez" },
  habitaciones: [{ id: 1, numero: "101", tipo: "Doble", adultos: 2, menores: 0 }],
  plan: { nombre: "Best Available Rate" },
  senia: { registrada: false, importe: 0, medios: [] },
  garantia: null,
};

function renderTabla(reserva) {
  return render(
    <TablaLlegadas busqueda="" onBuscar={vi.fn()} consulta={{ data: { reservas: [reserva], anterioresPendientes: 0 } }} seleccionadaId={null} onSeleccionar={vi.fn()} />
  );
}

describe("TablaLlegadas — qué respaldo trae cada reserva", () => {
  it("reserva con tarjeta en garantía: lo muestra con marca y últimos 4 (nunca como 'Sin garantía')", () => {
    renderTabla({ ...BASE, garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" } });
    expect(screen.getByText(/Tarjeta en garantía · Visa \*\*\*\*4242/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin garantía/)).not.toBeInTheDocument();
  });

  it("reserva con pago anticipado (prepago o tarifa no reembolsable): muestra el pago", () => {
    renderTabla({ ...BASE, senia: { registrada: true, importe: 90000, medios: [{ medioPago: "Transferencia", importe: 90000, referencia: null }] } });
    expect(screen.getByText(/Transferencia/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin garantía/)).not.toBeInTheDocument();
  });

  it("sin tarjeta ni pago anticipado: avisa que hay que tomar la garantía al ingreso", () => {
    renderTabla(BASE);
    expect(screen.getByText(/Sin garantía · tomar al ingreso/)).toBeInTheDocument();
  });

  it("tarjeta y pago anticipado a la vez: muestra las dos cosas", () => {
    renderTabla({
      ...BASE,
      garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" },
      senia: { registrada: true, importe: 30000, medios: [{ medioPago: "Efectivo", importe: 30000, referencia: null }] },
    });
    expect(screen.getByText(/Tarjeta en garantía/)).toBeInTheDocument();
    expect(screen.getByText(/Efectivo/)).toBeInTheDocument();
  });

  it("reserva web no reembolsable (tarjeta cobrada al reservar): muestra la tarjeta en garantía y el pago anticipado con su referencia", () => {
    renderTabla({
      ...BASE,
      garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" },
      senia: {
        registrada: true,
        importe: 190000,
        medios: [{ medioPago: "Tarjeta crédito", importe: 190000, referencia: "Visa ****4242 · aut. CAP-123456" }],
      },
    });
    expect(screen.getByText(/Tarjeta en garantía · Visa \*\*\*\*4242/)).toBeInTheDocument();
    expect(screen.getByText(/aut\. CAP-123456/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin garantía/)).not.toBeInTheDocument();
  });

  it("reserva web flexible (solo tarjeta en garantía, sin pagos): no aparece como sin garantía", () => {
    renderTabla({ ...BASE, garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "1111" }, senia: { registrada: false, importe: 0, medios: [] } });
    expect(screen.getByText(/Visa \*\*\*\*1111/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin garantía/)).not.toBeInTheDocument();
  });

  it("textoSenia: sin pagos devuelve null", () => {
    expect(textoSenia({ registrada: false, importe: 0, medios: [] })).toBeNull();
    expect(textoSenia(undefined)).toBeNull();
  });
});
