// Elegir un plan en /web/resultados lo cotiza contra /api/web/cotizar antes
// de seguir a /web/datos (etapa 1B-1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "../../../App";
import { CLAVE_STORAGE } from "../ProcesoCompraContext";
import { cotizar } from "../ecommerce.api";
import { reiniciarMock } from "../ecommerce.mock";

vi.mock("../../../lib/sesion", () => ({ useSesion: () => ({ rol: null }) }));
vi.mock("../ecommerce.api", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, cotizar: vi.fn() };
});

function Ubicacion() {
  const { pathname } = useLocation();
  return <output data-testid="ruta">{pathname}</output>;
}

function renderResultados() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/web/resultados?desde=2099-10-16&hasta=2099-10-18&adultos=2&menores=1"]}>
        <App />
        <Ubicacion />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  reiniciarMock();
  vi.stubEnv("VITE_ECOMMERCE_MOCK", "true");
  window.scrollTo = vi.fn();
  cotizar.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("/web/resultados → Elegir", () => {
  it("cotiza la selección por tipo, guarda la cotización y sigue a /web/datos", async () => {
    cotizar.mockResolvedValue({ total: 46000, promedioPorNoche: 23000, noches: 2, plan: {}, habitaciones: [] });
    renderResultados();
    fireEvent.click(await screen.findByRole("button", { name: "Elegir No reembolsable por $ 42.500" }));

    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/datos"));
    expect(cotizar).toHaveBeenCalledWith({
      fechaDesde: "2099-10-16",
      fechaHasta: "2099-10-18",
      planTarifarioId: 2,
      habitaciones: [{ tipoHabitacionId: 2, adultos: 2, menores: 1 }],
    });
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_STORAGE));
    expect(guardado.plan.planTarifarioId).toBe(2);
    expect(guardado.cotizacion).toEqual({ total: 46000, promedioPorNoche: 23000, noches: 2 });
  });

  it("si la cotización falla, se queda en resultados con el mensaje y sin plan elegido", async () => {
    cotizar.mockRejectedValue({ codigo: "SIN_DISPONIBILIDAD", mensaje: "Sin disponibilidad para estas fechas.", status: 409 });
    renderResultados();
    fireEvent.click(await screen.findByRole("button", { name: "Elegir Tarifa flexible por $ 50.000" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("ruta")).toHaveTextContent("/web/resultados");
    expect(JSON.parse(sessionStorage.getItem(CLAVE_STORAGE) ?? "{}").plan ?? null).toBeNull();
  });
});
