import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GarantiaFieldset } from "./GarantiaFieldset";
import { SeccionGarantia } from "./SeccionGarantia";
import { obtenerGarantiasReserva } from "../garantias/garantias.api";

vi.mock("../garantias/garantias.api", () => ({ obtenerGarantiasReserva: vi.fn() }));

const SALIDA = "2099-03-12T00:00:00.000Z";
const onCambiar = vi.fn();

function renderFieldset(props = {}) {
  return render(
    <GarantiaFieldset
      garantiaConfirmada={false}
      medioGarantia="Tarjeta crédito"
      garantiaTarjeta={undefined}
      tarjetaGuardada={null}
      fechaHasta={SALIDA}
      onCambiar={onCambiar}
      {...props}
    />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("GarantiaFieldset — garantía del check-in", () => {
  it("ofrece solo Tarjeta de crédito y Efectivo (no débito ni transferencia)", () => {
    renderFieldset();
    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect([...opciones].sort()).toEqual(["Efectivo", "Tarjeta crédito"]);
    expect(opciones).toHaveLength(2);
  });

  it("aclara que NO es un pago", () => {
    renderFieldset();
    expect(screen.getByText(/No es un pago: no se descuenta del alojamiento/)).toBeInTheDocument();
  });

  it("efectivo: se confirma como depósito en custodia, no como pago", async () => {
    renderFieldset({ medioGarantia: "Efectivo" });
    expect(screen.getByText(/Queda en custodia, no como un pago/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Confirmo que recibí/));
    expect(onCambiar).toHaveBeenCalledWith({ garantiaConfirmada: true });
  });

  it("cambiar de medio invalida lo que se había confirmado", async () => {
    renderFieldset({ medioGarantia: "Efectivo", garantiaConfirmada: true });
    await userEvent.selectOptions(screen.getByLabelText("Medio de garantía *"), "Tarjeta crédito");
    expect(onCambiar).toHaveBeenCalledWith({
      garantiaConfirmada: false,
      garantiaTarjeta: undefined,
      medioGarantia: "Tarjeta crédito",
    });
  });

  describe("reserva con tarjeta guardada", () => {
    const guardada = { marca: "Visa", ultimos4: "4242" };

    it("preautoriza esa tarjeta sin volver a pedirla", async () => {
      renderFieldset({ tarjetaGuardada: guardada });
      expect(screen.getByText("Visa ****4242")).toBeInTheDocument();
      expect(screen.queryByLabelText("Número de tarjeta *")).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText(/Confirmo la preautorización/));
      expect(onCambiar).toHaveBeenCalledWith({ garantiaConfirmada: true, garantiaTarjeta: undefined });
    });

    it("permite usar otra tarjeta", async () => {
      renderFieldset({ tarjetaGuardada: guardada });
      await userEvent.click(screen.getByRole("button", { name: "Usar otra tarjeta" }));
      expect(await screen.findByLabelText("Número de tarjeta *")).toBeInTheDocument();
    });
  });

  describe("sin tarjeta guardada (walk-in o reserva sin tarjeta)", () => {
    async function completar({ numero = "4242424242424242", titular = "ANA PEREZ", vencimiento = "1299", cvv = "123" } = {}) {
      const usuario = userEvent.setup();
      const escribir = async (etiqueta, valor) => valor && usuario.type(screen.getByLabelText(etiqueta), valor);
      await escribir("Número de tarjeta *", numero);
      await escribir("Titular *", titular.trim() && titular);
      await escribir("Vencimiento (MM/AA) *", vencimiento);
      await escribir("Código de seguridad *", cvv);
      await usuario.click(screen.getByRole("button", { name: /Confirmar tarjeta/ }));
    }

    it("pide los datos y, si están bien, confirma enviando la tarjeta lista para la pasarela", async () => {
      renderFieldset();
      await completar();
      expect(onCambiar).toHaveBeenCalledWith({
        garantiaConfirmada: true,
        garantiaTarjeta: { titular: "ANA PEREZ", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "123" },
      });
    });

    it("con datos inválidos marca qué falta y NO confirma", async () => {
      renderFieldset();
      await completar({ numero: "4242424242424243", titular: " ", vencimiento: "", cvv: "1" });
      expect(await screen.findByText("Número de tarjeta inválido.")).toBeInTheDocument();
      expect(screen.getByText("Ingresá el titular.")).toBeInTheDocument();
      expect(onCambiar).not.toHaveBeenCalled();
    });

    it("una tarjeta que vence antes de la salida se rechaza en pantalla", async () => {
      renderFieldset({ fechaHasta: "2099-03-12T00:00:00.000Z" });
      await completar({ vencimiento: "0299" }); // vence 28/02/2099, la salida es el 12/03/2099
      expect(await screen.findByText("La tarjeta vence antes de la fecha de salida.")).toBeInTheDocument();
      expect(onCambiar).not.toHaveBeenCalled();
    });

    it("confirmada: muestra solo los últimos 4 y deja cambiarla", async () => {
      renderFieldset({
        garantiaConfirmada: true,
        garantiaTarjeta: { titular: "A", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" },
      });
      expect(screen.getByText(/\*\*\*\*4242/)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("4242424242424242");
      await userEvent.click(screen.getByRole("button", { name: "Cambiar tarjeta" }));
      expect(onCambiar).toHaveBeenCalledWith({ garantiaConfirmada: false, garantiaTarjeta: undefined });
    });
  });
});

describe("SeccionGarantia — consulta de la tarjeta guardada", () => {
  function renderSeccion(props) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <SeccionGarantia
          garantia={{ garantiaConfirmada: false, medioGarantia: "Tarjeta crédito", garantiaTarjeta: undefined }}
          dispatch={vi.fn()}
          fechaHasta={SALIDA}
          {...props}
        />
      </QueryClientProvider>
    );
  }

  it("reserva con tarjeta en garantía: ofrece esa tarjeta", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: { tieneTarjeta: true, marca: "Visa", ultimos4: "4242" }, estadia: null });
    renderSeccion({ reservaId: 7 });
    expect(await screen.findByText("Visa ****4242")).toBeInTheDocument();
    expect(obtenerGarantiasReserva).toHaveBeenCalledWith(7);
  });

  it("con tarjeta guardada, el medio por defecto pasa a Tarjeta de crédito", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: { tieneTarjeta: true, marca: "Visa", ultimos4: "4242" }, estadia: null });
    const dispatch = vi.fn();
    renderSeccion({ reservaId: 7, dispatch, garantia: { garantiaConfirmada: false, medioGarantia: "Efectivo", garantiaTarjeta: undefined } });
    await screen.findByLabelText("Medio de garantía *");
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ tipo: "garantia", cambios: { medioGarantia: "Tarjeta crédito" } })
    );
  });

  it("reserva sin tarjeta guardada: pide una tarjeta nueva", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: null });
    renderSeccion({ reservaId: 7 });
    expect(await screen.findByLabelText("Número de tarjeta *")).toBeInTheDocument();
  });

  it("si la consulta falla, deja cargar una tarjeta (no bloquea el check-in)", async () => {
    obtenerGarantiasReserva.mockRejectedValue(new Error("sin conexión"));
    renderSeccion({ reservaId: 7 });
    expect(await screen.findByLabelText("Número de tarjeta *")).toBeInTheDocument();
  });

  it("walk-in (sin reserva): no consulta nada y pide tarjeta o depósito", () => {
    renderSeccion({});
    expect(obtenerGarantiasReserva).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Número de tarjeta *")).toBeInTheDocument();
  });
});
