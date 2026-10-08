import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMutacionUnica } from "./useMutacionUnica";

const envoltorio = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })}>{children}</QueryClientProvider>
);

describe("useMutacionUnica", () => {
  it("dos clics en el mismo instante mandan UN solo envío (bloqueo sincrónico)", async () => {
    let terminar;
    const enviar = vi.fn(() => new Promise((resolver) => (terminar = resolver)));
    const { result } = renderHook(() => useMutacionUnica({ mutationFn: enviar }), { wrapper: envoltorio });
    act(() => {
      result.current.mutate("a");
      result.current.mutate("a");
    });
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(enviar).toHaveBeenCalledTimes(1);
    await act(async () => terminar("ok"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("al terminar (también con error) se puede volver a enviar y no se reintenta solo", async () => {
    const enviar = vi.fn().mockRejectedValueOnce(new Error("falló")).mockResolvedValueOnce("ok");
    const { result } = renderHook(() => useMutacionUnica({ mutationFn: enviar }), { wrapper: envoltorio });
    act(() => result.current.mutate("a"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(enviar).toHaveBeenCalledTimes(1);
    act(() => result.current.mutate("b"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(enviar).toHaveBeenCalledTimes(2);
  });
});
