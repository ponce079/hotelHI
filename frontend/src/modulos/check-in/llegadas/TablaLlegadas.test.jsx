// Columna "Garantía" de las llegadas: cómo está asegurada cada reserva.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TablaLlegadas, textoGarantia } from "./TablaLlegadas";

const SIN_SENIA = { registrada: false, importe: 0, medios: [] };
const SIN_PREPAGO = { registrado: false, importe: 0 };

function llegada(id, extra = {}) {
  return {
    id,
    codigoConfirmacion: `0000000${id}`,
    fechaDesde: "2026-10-04T00:00:00.000Z",
    fechaHasta: "2026-10-06T00:00:00.000Z",
    noches: 2,
    titular: { nombre: `Titular ${id}` },
    habitaciones: [{ id, numero: "030", tipo: "Doble", adultos: 2, menores: 0 }],
    senia: SIN_SENIA,
    prepago: SIN_PREPAGO,
    garantiaWeb: null,
    ...extra,
  };
}

const PREPAGADA = llegada(1, { prepago: { registrado: true, importe: 80000 }, garantiaWeb: { marca: "VISA", ultimos4: "4242" } });
const GARANTIZADA = llegada(2, { garantiaWeb: { marca: "MASTERCARD", ultimos4: "4444" } });
const CON_SENIA = llegada(3, {
  senia: { registrada: true, importe: 24000, medios: [{ medioPago: "Tarjeta crédito", importe: 24000, referencia: "VISA ****4242 · aut. 5521" }] },
});
const SIN_NADA = llegada(4);

describe("textoGarantia", () => {
  it("prepago → Prepagada (aunque también tenga datos de tarjeta)", () => {
    expect(textoGarantia(PREPAGADA)).toMatch(/^Prepagada · \$\s?80\.000$/);
  });

  it("tarjeta web sin prepago → Garantizada con tarjeta · MARCA ••1234", () => {
    expect(textoGarantia(GARANTIZADA)).toBe("Garantizada con tarjeta · MASTERCARD ••4444");
  });

  it("seña → como siempre (la referencia de la seña)", () => {
    expect(textoGarantia(CON_SENIA)).toBe("VISA ****4242 · aut. 5521");
  });

  it("nada → null", () => {
    expect(textoGarantia(SIN_NADA)).toBeNull();
  });
});

describe("TablaLlegadas — columna Garantía", () => {
  it("muestra los cuatro casos", () => {
    render(
      <TablaLlegadas
        busqueda=""
        onBuscar={vi.fn()}
        consulta={{ isLoading: false, data: { reservas: [PREPAGADA, GARANTIZADA, CON_SENIA, SIN_NADA], anterioresPendientes: 0 } }}
        seleccionadaId={null}
        onSeleccionar={vi.fn()}
      />
    );
    const fila = (id) => screen.getAllByRole("row").find((r) => r.getAttribute("data-reserva") === String(id));
    expect(within(fila(1)).getByText(/^Prepagada · \$\s?80\.000$/)).toBeInTheDocument();
    expect(within(fila(2)).getByText("Garantizada con tarjeta · MASTERCARD ••4444")).toBeInTheDocument();
    expect(within(fila(3)).getByText("VISA ****4242 · aut. 5521")).toBeInTheDocument();
    expect(within(fila(4)).getByText("Sin garantía · tomar al ingreso")).toBeInTheDocument();
  });
});
