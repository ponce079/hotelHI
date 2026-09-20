import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const registrar = vi.fn();
vi.mock("./pagoEstadia.api", () => ({ registrarPagoEstadia: (p) => registrar(p) }));
import { PagoEstadiaWizard } from "./PagoEstadiaWizard";

function montar(saldo = 145000) {
  const onExito = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PagoEstadiaWizard reservaId={3} saldo={saldo} onClose={() => {}} onExito={onExito} />
    </QueryClientProvider>
  );
  return { onExito };
}
const boton = (nombre) => screen.getByRole("button", { name: nombre });
const escribir = (label, valor) => fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });

async function completarTarjeta({ numero = "4242424242424242" } = {}) {
  escribir("Número de tarjeta", numero);
  escribir("Titular", "MARTINA NOE");
  escribir("Vencimiento (MM/AA)", "1228");
  escribir("Código de seguridad", "123");
}

describe("PagoEstadiaWizard con tarjeta simulada", () => {
  beforeEach(() => { vi.useFakeTimers(); registrar.mockReset(); registrar.mockResolvedValue({ estado: "Pagado" }); });
  afterEach(() => vi.useRealTimers());

  it("con tarjeta no se puede confirmar hasta autorizar; al autorizar queda referencia sin datos de la tarjeta", async () => {
    const { onExito } = montar();
    fireEvent.click(boton("Tarjeta crédito"));
    expect(boton("Confirmar pago").disabled).toBe(true);
    expect(screen.getByText("Falta autorizar el cobro con tarjeta.")).toBeTruthy();

    fireEvent.click(boton("Cobrar con tarjeta"));
    await completarTarjeta();
    fireEvent.change(screen.getByLabelText("Cuotas"), { target: { value: "3" } });
    fireEvent.click(boton(/Autorizar \$/));
    expect(screen.getByText("Contactando al procesador…")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(1600); });

    expect(screen.getByText("Autorizada")).toBeTruthy();
    expect(screen.queryByText(/Terminal de pago simulada/)).toBeNull();
    expect(boton("Confirmar pago").disabled).toBe(false);

    fireEvent.click(boton("Confirmar pago"));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(registrar).toHaveBeenCalledTimes(1);
    const payload = registrar.mock.calls[0][0];
    expect(payload.reservaId).toBe(3);
    expect(payload.medios).toHaveLength(1);
    expect(payload.medios[0]).toMatchObject({ tipo: "Tarjeta crédito", importe: 145000 });
    expect(payload.medios[0].referencia).toMatch(/^Visa \*\*\*\*4242 · aut\. \d{6} · 3 cuotas$/);
    // ni el número ni el código viajan al backend
    expect(JSON.stringify(payload)).not.toMatch(/4242424242424242|4242 4242|"123"/);
    expect(onExito).toHaveBeenCalled();
  });

  it("tarjeta terminada en 0002 se rechaza y no habilita el pago", async () => {
    montar();
    fireEvent.click(boton("Tarjeta débito"));
    fireEvent.click(boton("Cobrar con tarjeta"));
    await completarTarjeta({ numero: "4000000000000002" }); // Luhn válido y termina en 0002
    fireEvent.click(boton(/Autorizar \$/));
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(screen.getByText(/Pago rechazado por el emisor/)).toBeTruthy();
    expect(screen.queryByText("Autorizada")).toBeNull();
    expect(boton("Confirmar pago").disabled).toBe(true);
    expect(boton("Reintentar")).toBeTruthy();
  });

  it("número inválido, vencida o sin titular: no llega al procesador", async () => {
    montar();
    fireEvent.click(boton("Tarjeta crédito"));
    fireEvent.click(boton("Cobrar con tarjeta"));
    escribir("Número de tarjeta", "4242424242424241"); // Luhn inválido
    escribir("Vencimiento (MM/AA)", "0120"); // vencida
    escribir("Código de seguridad", "12");
    fireEvent.click(boton(/Autorizar \$/));
    expect(screen.getByText("Número de tarjeta inválido.")).toBeTruthy();
    expect(screen.getByText("Ingresá el titular.")).toBeTruthy();
    expect(screen.getByText(/Vencimiento inválido o vencido/)).toBeTruthy();
    expect(screen.getByText("3 o 4 dígitos.")).toBeTruthy();
    expect(screen.queryByText("Contactando al procesador…")).toBeNull();
  });

  it("efectivo no pide tarjeta y se confirma directo; el débito no ofrece cuotas", async () => {
    montar();
    fireEvent.click(boton("Efectivo"));
    expect(screen.queryByText("Cobrar con tarjeta")).toBeNull();
    expect(boton("Confirmar pago").disabled).toBe(false);
    fireEvent.click(boton("Tarjeta débito"));
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar con tarjeta" })[0]);
    expect(screen.queryByLabelText("Cuotas")).toBeNull();
  });

  it("pago mixto: efectivo + tarjeta autorizada, referencia solo en la tarjeta", async () => {
    montar(1000);
    fireEvent.click(boton("Efectivo"));
    // efectivo toma todo el saldo; se lo bajamos y agregamos tarjeta por el resto
    const inputs = screen.getAllByPlaceholderText("0,00");
    fireEvent.change(inputs[0], { target: { value: "400" } });
    fireEvent.click(boton("Tarjeta crédito"));
    fireEvent.click(boton("Cobrar con tarjeta"));
    await completarTarjeta();
    fireEvent.click(boton(/Autorizar \$ 600,00/));
    await act(async () => { vi.advanceTimersByTime(1600); });
    fireEvent.click(boton("Confirmar pago"));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const medios = registrar.mock.calls[0][0].medios;
    expect(medios[0]).toMatchObject({ tipo: "Efectivo", importe: 400 });
    expect(medios[0].referencia).toBeUndefined();
    expect(medios[1]).toMatchObject({ tipo: "Tarjeta crédito", importe: 600 });
    expect(medios[1].referencia).toMatch(/^Visa \*\*\*\*4242 · aut\. \d{6}$/); // 1 cuota: no se menciona
  });
});
