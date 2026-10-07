import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConsumoModal } from "./ConsumoModal";
import { registrarConsumo } from "./serviciosAdicionales.api";

vi.mock("./serviciosAdicionales.api", () => ({ registrarConsumo: vi.fn() }));
vi.mock("../depositos/depositos.api", () => ({ listarDepositos: vi.fn().mockResolvedValue([]) }));
vi.mock("../stock/stock.api", () => ({ consultarStock: vi.fn().mockResolvedValue([]) }));
vi.mock("../../lib/sesion", () => ({ useSesionOpcional: () => ({ rol: "recepcionista", usuario: "recepcionista.prueba" }) }));

const reserva = {
  id: 5,
  codigoConfirmacion: "ABC12345",
  estado: "En curso",
  fechaDesde: "2026-10-05",
  fechaHasta: "2026-10-09",
  habitaciones: [{ id: 3, numero: "301" }],
};

beforeEach(() => {
  registrarConsumo.mockReset();
  registrarConsumo.mockResolvedValue({ id: 1 });
});

describe("ConsumoModal — Registrado por", () => {
  it("es el usuario de la sesión (no se tipea) y es lo que se manda con el consumo", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ConsumoModal reserva={reserva} onClose={() => {}} onExito={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Registrado por")).toBeInTheDocument();
    expect(screen.getByText("recepcionista.prueba")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Registrado por/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Precio unitario/), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(registrarConsumo).toHaveBeenCalledTimes(1));
    expect(registrarConsumo.mock.calls[0][0].registradoPor).toBe("recepcionista.prueba");
  });
});
