import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { descripcionDeGarantia, GarantiaCheckOut } from "./GarantiaCheckOut";
import { aplicarGarantiaAlSaldo, obtenerGarantiasReserva } from "./garantias.api";

vi.mock("./garantias.api", () => ({ obtenerGarantiasReserva: vi.fn(), aplicarGarantiaAlSaldo: vi.fn() }));

const PRE = { tipo: "PREAUTORIZACION", estado: "Pendiente", monto: 30000, montoUsado: 0, marca: "Visa", ultimos4: "4242" };
const DEP = { tipo: "DEPOSITO_EFECTIVO", estado: "Pendiente", monto: 30000, montoUsado: 0, marca: null, ultimos4: null };
const onMensaje = vi.fn();

function renderCard(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GarantiaCheckOut reservaId={7} saldo={20000} enCurso puedeGestionar onMensaje={onMensaje} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("descripcionDeGarantia", () => {
  it("preautorización pendiente con saldo: se puede cobrar solo el saldo", () => {
    const d = descripcionDeGarantia(PRE, 20000);
    expect(d).toMatchObject({ usable: true, aplicable: 20000, esTarjeta: true });
    expect(d.titulo).toMatch(/Preautorización en Visa \*\*\*\*4242: \$\s?30\.000/);
    expect(d.detalle).toMatch(/se libera al confirmar/);
  });
  it("saldo mayor que la garantía: se aplica la garantía entera", () => {
    expect(descripcionDeGarantia(PRE, 80000).aplicable).toBe(30000);
  });
  it("cuenta saldada: se libera (tarjeta) o se devuelve (efectivo) al confirmar, y no se ofrece usarla", () => {
    expect(descripcionDeGarantia(PRE, 0)).toMatchObject({ usable: false });
    expect(descripcionDeGarantia(PRE, 0).detalle).toMatch(/se libera la retención/);
    expect(descripcionDeGarantia(DEP, 0).detalle).toMatch(/se devuelve el depósito/);
  });
  it("ya usada: informa cuánto se usó y qué pasa con el resto", () => {
    const d = descripcionDeGarantia({ ...DEP, estado: "Aplicada", montoUsado: 12000 }, 0);
    expect(d.usable).toBe(false);
    expect(d.detalle).toMatch(/Se usaron \$\s?12\.000/);
    expect(d.detalle).toMatch(/El resto \(\$\s?18\.000\) se devuelve al confirmar/);
  });
});

describe("GarantiaCheckOut", () => {
  it("reservas sin garantía del check-in: no muestra nada", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: null });
    const { container } = renderCard();
    await waitFor(() => expect(obtenerGarantiasReserva).toHaveBeenCalledWith(7));
    expect(container).toBeEmptyDOMElement();
  });

  it("tarjeta: ofrece cobrar el saldo a la tarjeta en garantía y avisa lo que se usó", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: PRE });
    aplicarGarantiaAlSaldo.mockResolvedValue({ aplicado: 20000, medioPago: "Tarjeta crédito" });
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: /Cobrar \$\s?20\.000 a la tarjeta en garantía/ }));
    await waitFor(() => expect(aplicarGarantiaAlSaldo).toHaveBeenCalledWith(7));
    await waitFor(() => expect(onMensaje).toHaveBeenCalledWith(expect.stringMatching(/Se usaron \$\s?20\.000 de la garantía/)));
  });

  it("depósito en efectivo: ofrece aplicarlo al saldo", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: DEP });
    renderCard();
    expect(await screen.findByRole("button", { name: /Aplicar \$\s?20\.000 del depósito al saldo/ })).toBeInTheDocument();
  });

  it("si el backend rechaza, muestra el motivo y no inventa un éxito", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: PRE });
    aplicarGarantiaAlSaldo.mockRejectedValue({ response: { data: { error: "No se pudo cobrar a la tarjeta en garantía: Pasarela caída." } } });
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: /Cobrar/ }));
    await waitFor(() => expect(onMensaje).toHaveBeenCalledWith("No se pudo cobrar a la tarjeta en garantía: Pasarela caída."));
  });

  it("sin permiso de gestionar, o fuera de la estadía en curso, no ofrece usarla (solo informa)", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: PRE });
    renderCard({ puedeGestionar: false });
    expect(await screen.findByText(/Preautorización en Visa/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cobrar/ })).not.toBeInTheDocument();
  });

  it("cuenta saldada: informa que se libera y no ofrece nada que cobrar", async () => {
    obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: PRE });
    renderCard({ saldo: 0 });
    expect(await screen.findByText(/se libera la retención al confirmar el check-out/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cobrar/ })).not.toBeInTheDocument();
  });
});
