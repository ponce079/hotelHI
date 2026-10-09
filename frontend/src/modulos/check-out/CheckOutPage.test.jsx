import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { listarReservas } from "../reservas/reservas.api";
import { CheckOutPage } from "./CheckOutPage";

vi.mock("../reservas/reservas.api", () => ({ listarReservas: vi.fn() }));
vi.mock("./GarantiasARevisar", () => ({ GarantiasARevisar: () => null }));

let sesion;
vi.mock("../../lib/sesion", () => ({ useSesion: () => sesion }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const recepcionista = { puede: () => true };
const admin = { puede: (a) => a === "verCheckOut" };

function reserva(id, hasta, extra = {}) {
  return {
    id,
    estado: "En curso",
    codigoConfirmacion: `RES-${id}`,
    fechaDesde: "2026-10-05T00:00:00.000Z",
    fechaHasta: `${hasta}T00:00:00.000Z`,
    huesped: { nombre: `Huésped ${id}`, tipoDocumento: "DNI", numeroDocumento: "30124127", paisDocumento: "AR" },
    planTarifario: { nombre: "Flexible", reembolsable: true },
    habitaciones: [{ numero: String(400 + id), tipo: "Doble", adultos: 2, menores: 1 }],
    ...extra,
  };
}

const DATOS = [reserva(1, "2026-10-12"), reserva(2, "2026-10-09"), reserva(3, "2026-10-07"), reserva(4, "2026-10-09")];

function montar(url = "/check-out") {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[url]}>
        <CheckOutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sesion = recepcionista;
  mockNavigate.mockReset();
  listarReservas.mockReset();
  listarReservas.mockResolvedValue(DATOS);
  // 22:30 hora argentina del 9/10 = 01:30 UTC del 10/10.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T01:30:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("CheckOutPage", () => {
  it("con vencidas abre en Vencidas y muestra la vencida; los contadores coinciden", async () => {
    montar();
    expect(await screen.findByText("RES-3")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Vencidas/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Salen hoy/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Vencidas/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Todas en casa/ })).toHaveTextContent("4");
    expect(screen.getByText("Salida vencida · 2 días")).toBeInTheDocument();
    expect(screen.queryByText("RES-2")).not.toBeInTheDocument();
  });

  it("CA5: a las 22:30 hora argentina, una salida de ese día es 'Sale hoy'", async () => {
    montar("/check-out?vista=hoy");
    expect(await screen.findByText("RES-2")).toBeInTheDocument();
    expect(screen.getAllByText("Sale hoy")).toHaveLength(2);
  });

  it("sin vencidas abre en Salen hoy", async () => {
    listarReservas.mockResolvedValue([reserva(2, "2026-10-09"), reserva(1, "2026-10-12")]);
    montar();
    expect(await screen.findByText("RES-2")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Salen hoy/ })).toHaveAttribute("aria-selected", "true");
  });

  it("Todas en casa ordena vencidas, hoy y el resto; documento enmascarado y plan no reembolsable", async () => {
    listarReservas.mockResolvedValue([
      ...DATOS.slice(0, 3),
      reserva(4, "2026-10-09", { planTarifario: { nombre: "Promo", reembolsable: false } }),
    ]);
    montar("/check-out?vista=todas");
    await screen.findByText("RES-3");
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas.map((f) => within(f).getByText(/^RES-/).textContent)).toEqual(["RES-3", "RES-2", "RES-4", "RES-1"]);
    expect(screen.getAllByText(/DNI •••• 4127/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/30124127/)).not.toBeInTheDocument();
    expect(screen.getByText("No reembolsable")).toBeInTheDocument();
    expect(screen.getAllByText("2 ad · 1 men").length).toBe(4);
    expect(screen.getByText("quedan 3 noches")).toBeInTheDocument();
  });

  it("la fila y 'Iniciar check-out' llevan a la pantalla de cierre", async () => {
    montar();
    const boton = await screen.findByRole("button", { name: /Iniciar check-out de la reserva RES-3/ });
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(boton);
    expect(mockNavigate).toHaveBeenCalledWith("/check-out/3");
  });

  it("sin permiso de gestionar muestra 'Ver cuenta' en vez del botón", async () => {
    sesion = admin;
    montar();
    expect(await screen.findByRole("link", { name: "Ver cuenta" })).toHaveAttribute("href", "/check-out/3");
    expect(screen.queryByRole("button", { name: /Iniciar check-out/ })).not.toBeInTheDocument();
  });

  it("vacío por pestaña", async () => {
    listarReservas.mockResolvedValue([reserva(1, "2026-10-12")]);
    montar("/check-out?vista=hoy");
    expect(await screen.findByText("No hay salidas para hoy")).toBeInTheDocument();
  });

  it("error con reintento", async () => {
    listarReservas.mockRejectedValueOnce(new Error("x"));
    montar();
    const reintentar = await screen.findByRole("button", { name: "Reintentar" });
    listarReservas.mockResolvedValue(DATOS);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(reintentar);
    await waitFor(() => expect(screen.getByText("RES-3")).toBeInTheDocument());
  });

  it("la búsqueda va al servidor con 300 ms de retardo", async () => {
    montar();
    await screen.findByText("RES-3");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText("Buscar estadías"), "403");
    expect(listarReservas).not.toHaveBeenCalledWith(expect.objectContaining({ q: "403" }));
    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(listarReservas).toHaveBeenCalledWith({ estado: "En curso", q: "403" }));
  });

  it("sin permiso de ver muestra SinPermiso", () => {
    sesion = { puede: () => false };
    montar();
    expect(listarReservas).not.toHaveBeenCalled();
  });
});
