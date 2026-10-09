import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { contarLlegadas, contarSalidas, resumirEnCasa, TOPE_LLEGADAS, useContadoresRecepcion } from "./useContadoresRecepcion";
import { hoyEnHoraLocal } from "./fechas";
import { listarLlegadas } from "../modulos/check-in/checkIn.api";
import { listarReservas } from "../modulos/reservas/reservas.api";

vi.mock("../modulos/check-in/checkIn.api", () => ({ listarLlegadas: vi.fn() }));
vi.mock("../modulos/reservas/reservas.api", () => ({ listarReservas: vi.fn() }));

// Fechas relativas a "hoy" en hora argentina: ningún caso depende del día en que se corre.
function diaRelativo(dias) {
  const [a, m, d] = hoyEnHoraLocal().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function enCurso(id, diasHastaSalida, habitaciones = 1) {
  return {
    id,
    estado: "En curso",
    fechaDesde: `${diaRelativo(-3)}T00:00:00.000Z`,
    fechaHasta: `${diaRelativo(diasHastaSalida)}T00:00:00.000Z`,
    habitaciones: Array.from({ length: habitaciones }, (_, i) => ({ id: id * 10 + i })),
  };
}

function llegada(id, habitaciones = 1) {
  return { id, habitaciones: Array.from({ length: habitaciones }, (_, i) => ({ id: id * 10 + i })) };
}

describe("contarLlegadas", () => {
  it("cuenta reservas, no habitaciones: una reserva grupal de 3 habitaciones es 1 llegada", () => {
    expect(contarLlegadas({ reservas: [llegada(1, 3), llegada(2)], anterioresPendientes: 7 })).toBe(2);
  });

  it("sin datos o con un formato inesperado da 0", () => {
    expect(contarLlegadas(undefined)).toBe(0);
    expect(contarLlegadas({})).toBe(0);
    expect(contarLlegadas({ reservas: [] })).toBe(0);
  });

  it("si el endpoint llegó a su tope no se muestra un número que podría ser falso", () => {
    const tope = Array.from({ length: TOPE_LLEGADAS }, (_, i) => llegada(i + 1));
    expect(contarLlegadas({ reservas: tope })).toBe(0);
  });
});

describe("contarSalidas", () => {
  it("cuenta las estadías en curso con salida hoy o anterior y separa las vencidas", () => {
    const reservas = [enCurso(1, 0), enCurso(2, -1), enCurso(3, -5), enCurso(4, 1), enCurso(5, 3)];
    expect(contarSalidas(reservas)).toEqual({ salidas: 3, vencidas: 2 });
  });

  it("una reserva grupal de 3 habitaciones cuenta una sola vez", () => {
    expect(contarSalidas([enCurso(1, 0, 3), enCurso(2, 0, 2)])).toEqual({ salidas: 2, vencidas: 0 });
  });

  it("ignora lo que no está en curso y no se corre con la hora del día", () => {
    expect(contarSalidas([{ ...enCurso(1, 0), estado: "Cerrada" }, { ...enCurso(2, 0), estado: "Confirmada" }])).toEqual({
      salidas: 0,
      vencidas: 0,
    });
    expect(contarSalidas([{ ...enCurso(1, 0), fechaHasta: `${diaRelativo(0)}T23:59:59.000Z` }]).salidas).toBe(1);
  });

  it("usa la fecha de hoy que se le pasa (hora argentina)", () => {
    expect(contarSalidas([enCurso(1, 0)], diaRelativo(1))).toEqual({ salidas: 1, vencidas: 1 });
  });

  it("sin datos da 0", () => {
    expect(contarSalidas(undefined)).toEqual({ salidas: 0, vencidas: 0 });
  });
});

function envoltorio(ruta = "/", queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const Envoltorio = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { queryClient, Envoltorio };
}

describe("useContadoresRecepcion", () => {
  beforeEach(() => {
    listarLlegadas.mockReset();
    listarReservas.mockReset();
    listarLlegadas.mockResolvedValue({ reservas: [llegada(1, 3)] });
    listarReservas.mockResolvedValue([enCurso(1, 0), enCurso(2, -2)]);
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("devuelve llegadas, salidas y vencidas con los endpoints existentes", async () => {
    const { Envoltorio } = envoltorio();
    const { result } = renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), {
      wrapper: Envoltorio,
    });
    await waitFor(() => expect(result.current).toMatchObject({ llegadas: 1, salidas: 2, vencidas: 1 }));
    expect(listarLlegadas).toHaveBeenCalledTimes(1);
    expect(listarReservas).toHaveBeenCalledWith({ estado: "En curso" });
  });

  it("un rol sin acceso a un ítem no dispara su pedido", async () => {
    const { Envoltorio } = envoltorio();
    const { result } = renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: false, puedeVerCheckOut: false }), {
      wrapper: Envoltorio,
    });
    await act(async () => {});
    expect(listarLlegadas).not.toHaveBeenCalled();
    expect(listarReservas).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ llegadas: 0, salidas: 0, vencidas: 0 });
  });

  it("solo pide lo que el rol puede ver", async () => {
    const { Envoltorio } = envoltorio();
    renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: false }), { wrapper: Envoltorio });
    await waitFor(() => expect(listarLlegadas).toHaveBeenCalled());
    expect(listarReservas).not.toHaveBeenCalled();
  });

  it("si los pedidos fallan devuelve 0 y no lanza error", async () => {
    listarLlegadas.mockRejectedValue(new Error("sin red"));
    listarReservas.mockRejectedValue(new Error("sin red"));
    const { Envoltorio } = envoltorio();
    const { result } = renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), {
      wrapper: Envoltorio,
    });
    await waitFor(() => expect(listarLlegadas).toHaveBeenCalled());
    await waitFor(() => expect(listarReservas).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toMatchObject({ llegadas: 0, salidas: 0, vencidas: 0 });
  });

  it("se actualiza al invalidar las claves que invalidan las pantallas al confirmar un check-in o un check-out", async () => {
    const { Envoltorio, queryClient } = envoltorio();
    const { result } = renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), {
      wrapper: Envoltorio,
    });
    await waitFor(() => expect(result.current.llegadas).toBe(1));

    listarLlegadas.mockResolvedValue({ reservas: [] });
    await act(() => queryClient.invalidateQueries({ queryKey: ["check-in"] }));
    await waitFor(() => expect(result.current.llegadas).toBe(0));

    listarReservas.mockResolvedValue([]);
    await act(() => queryClient.invalidateQueries({ queryKey: ["reservas"] }));
    await waitFor(() => expect(result.current.salidas).toBe(0));
  });

  it("se refresca al entrar a /check-in", async () => {
    const { Envoltorio } = envoltorio("/check-in");
    renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), { wrapper: Envoltorio });
    await waitFor(() => expect(listarLlegadas).toHaveBeenCalled());
    // Montar + entrar a la ruta son el mismo pedido, no dos en paralelo.
    expect(listarLlegadas).toHaveBeenCalledTimes(1);
    expect(listarReservas).toHaveBeenCalledTimes(1);
  });

  it("repite cada 5 minutos con la pestaña visible y no pide con la pestaña oculta", async () => {
    vi.useFakeTimers();
    const { Envoltorio } = envoltorio();
    renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), { wrapper: Envoltorio });
    await vi.advanceTimersByTimeAsync(100);
    expect(listarLlegadas).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(listarLlegadas).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(listarLlegadas).toHaveBeenCalledTimes(2);
  });

  it("expone por separado llegadas de hoy y anteriores, salidas de hoy y vencidas, y lo que hay en casa", async () => {
    listarLlegadas.mockResolvedValue({ reservas: [llegada(1), llegada(2)], anterioresPendientes: 4 });
    listarReservas.mockResolvedValue([
      { ...enCurso(1, 0, 2), habitaciones: [{ adultos: 2, menores: 1 }, { adultos: 1, menores: 0 }] },
      enCurso(2, -2),
      enCurso(3, 2),
    ]);
    const { Envoltorio } = envoltorio();
    const { result } = renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), {
      wrapper: Envoltorio,
    });
    await waitFor(() => expect(result.current.salidasHoy).toBe(1));
    expect(result.current).toMatchObject({
      llegadas: 2,
      llegadasHoy: 2,
      llegadasAnteriores: 4,
      salidas: 2,
      salidasHoy: 1,
      salidasVencidas: 1,
      vencidas: 1,
    });
    expect(result.current.enCasa).toEqual({ habitaciones: 4, huespedes: 4 });
  });

  it("si un pedido falla, sus valores quedan en null (la tarjeta muestra —) y el badge en 0", async () => {
    listarLlegadas.mockRejectedValue(new Error("sin red"));
    listarReservas.mockRejectedValue(new Error("sin red"));
    const { Envoltorio } = envoltorio();
    const { result } = renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), {
      wrapper: Envoltorio,
    });
    await waitFor(() => expect(listarReservas).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toMatchObject({
      llegadasHoy: null,
      llegadasAnteriores: null,
      salidasHoy: null,
      salidasVencidas: null,
      enCasa: null,
      llegadas: 0,
      salidas: 0,
    });
  });

  it("puedeVerReservas trae la lista de En curso para un rol sin Check-out, sin pedir las llegadas", async () => {
    const { Envoltorio } = envoltorio();
    const { result } = renderHook(
      () => useContadoresRecepcion({ puedeVerCheckIn: false, puedeVerCheckOut: false, puedeVerReservas: true }),
      { wrapper: Envoltorio },
    );
    await waitFor(() => expect(result.current.salidasHoy).toBe(1));
    expect(listarLlegadas).not.toHaveBeenCalled();
    expect(result.current.llegadasHoy).toBeNull();
  });

  it("se refresca al entrar a /reservas, y no al entrar a su detalle", async () => {
    const { Envoltorio } = envoltorio("/reservas");
    renderHook(() => useContadoresRecepcion({ puedeVerCheckIn: true, puedeVerCheckOut: true }), { wrapper: Envoltorio });
    await waitFor(() => expect(listarLlegadas).toHaveBeenCalled());
    expect(listarLlegadas).toHaveBeenCalledTimes(1);
    expect(listarReservas).toHaveBeenCalledTimes(1);
  });
});

describe("resumirEnCasa", () => {
  it("suma habitaciones y personas (adultos y menores) solo de las En curso", () => {
    const r = { estado: "En curso", habitaciones: [{ adultos: 2, menores: 1 }, { adultos: 1 }] };
    expect(resumirEnCasa([r, { ...r, estado: "Cerrada" }])).toEqual({ habitaciones: 2, huespedes: 4 });
    expect(resumirEnCasa(undefined)).toBeNull();
  });
});
