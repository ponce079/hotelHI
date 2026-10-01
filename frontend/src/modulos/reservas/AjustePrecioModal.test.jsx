import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AjustePrecioModal } from "./AjustePrecioModal";
import { ajustarPrecioReserva } from "./reservas.api";

vi.mock("./reservas.api", () => ({ ajustarPrecioReserva: vi.fn() }));

const RESERVA = {
  id: 5,
  codigoConfirmacion: "RS-AJU01",
  habitaciones: [
    {
      id: 1,
      numero: "301",
      tipo: "Doble",
      reservaNoches: [
        { id: 100, fecha: "2027-09-10T00:00:00.000Z", precioNoche: 50000, ajustada: false, precioOriginal: null },
        { id: 101, fecha: "2027-09-11T00:00:00.000Z", precioNoche: 55000, ajustada: false, precioOriginal: null },
      ],
    },
  ],
};

const PREVIA = { totalAnterior: 105000, totalNuevo: 55000, diferencia: -50000 };

function renderModal(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onExito = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AjustePrecioModal reserva={RESERVA} onClose={onClose} onExito={onExito} {...props} />
    </QueryClientProvider>
  );
  return { ...utils, onClose, onExito };
}

beforeEach(() => {
  vi.clearAllMocks();
  ajustarPrecioReserva.mockResolvedValue(PREVIA);
});

describe("AjustePrecioModal — selección de noches y vista previa automática", () => {
  it("lista las noches de la reserva con su precio actual", () => {
    renderModal();
    expect(screen.getByText(/301 \(Doble\) · 10\/9\/2027/)).toBeInTheDocument();
    expect(screen.getByText(/301 \(Doble\) · 11\/9\/2027/)).toBeInTheDocument();
  });

  it("con noche + modo + valor + motivo completos, consulta sola una vista previa (soloPrevia) y la muestra", async () => {
    renderModal();

    fireEvent.click(screen.getByText(/10\/9\/2027/).closest("label").querySelector("input"));
    fireEvent.change(screen.getByLabelText(/Precio nuevo por noche/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Cortesía por reclamo del huésped" } });

    await waitFor(() =>
      expect(ajustarPrecioReserva).toHaveBeenCalledWith(
        RESERVA.id,
        expect.objectContaining({ nocheIds: [100], modo: "PRECIO_FIJO", soloPrevia: true })
      )
    );
    expect(await screen.findByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText(/diferencia -\$ ?50\.000/)).toBeInTheDocument();
  });

  it("sin motivo (o motivo corto) no consulta la vista previa ni habilita Confirmar", async () => {
    renderModal();

    fireEvent.click(screen.getByText(/10\/9\/2027/).closest("label").querySelector("input"));
    fireEvent.change(screen.getByLabelText(/Precio nuevo por noche/), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "corto" } });

    expect(ajustarPrecioReserva).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirmar ajuste" })).toBeDisabled();
  });

  it("confirmar manda el ajuste real (sin soloPrevia) y avisa el éxito", async () => {
    ajustarPrecioReserva.mockImplementation((id, payload) =>
      Promise.resolve(payload.soloPrevia ? PREVIA : { ...RESERVA })
    );
    const { onExito } = renderModal();

    fireEvent.click(screen.getByText(/10\/9\/2027/).closest("label").querySelector("input"));
    fireEvent.change(screen.getByLabelText(/Precio nuevo por noche/), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Cortesía por reclamo del huésped" } });
    await screen.findByText("Vista previa");

    fireEvent.click(screen.getByRole("button", { name: "Confirmar ajuste" }));

    await waitFor(() => expect(onExito).toHaveBeenCalled());
    const llamadaConfirmar = ajustarPrecioReserva.mock.calls.find((c) => !c[1].soloPrevia);
    expect(llamadaConfirmar[1]).toMatchObject({ nocheIds: [100], modo: "PRECIO_FIJO", valor: 0 });
  });

  it("modo descuento porcentual: valida entre 0 y 100 antes de habilitar la vista previa", async () => {
    renderModal();

    fireEvent.click(screen.getByText(/10\/9\/2027/).closest("label").querySelector("input"));
    fireEvent.change(screen.getByLabelText("Modo *"), { target: { value: "DESCUENTO_PORCENTAJE" } });
    fireEvent.change(screen.getByLabelText("Motivo * (mínimo 10 caracteres)"), {
      target: { value: "Descuento negociado con el huésped" },
    });

    fireEvent.change(screen.getByLabelText(/Descuento/), { target: { value: "150" } });
    expect(ajustarPrecioReserva).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Descuento/), { target: { value: "15" } });
    await waitFor(() =>
      expect(ajustarPrecioReserva).toHaveBeenCalledWith(
        RESERVA.id,
        expect.objectContaining({ modo: "DESCUENTO_PORCENTAJE", valor: 15, soloPrevia: true })
      )
    );
  });
});
