import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, render, screen } from "@testing-library/react";
import { useToast } from "./useToast";
import { Toast } from "../componentes/Toast";

describe("useToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("por defecto el aviso dura 3 s", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.mostrarToast("Listo"));
    act(() => vi.advanceTimersByTime(2900));
    expect(result.current.toast).toBe("Listo");
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.toast).toBe("");
  });

  it("con duración propia (Mi perfil: 5 s) sigue visible pasados los 4 s", () => {
    const { result } = renderHook(() => useToast(5000));
    act(() => result.current.mostrarToast("Foto actualizada"));
    act(() => vi.advanceTimersByTime(4100));
    expect(result.current.toast).toBe("Foto actualizada");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toast).toBe("");
  });

  it("el aviso se anuncia con role='status'", () => {
    render(<Toast mensaje="Foto eliminada" />);
    expect(screen.getByRole("status")).toHaveTextContent("Foto eliminada");
  });
});
