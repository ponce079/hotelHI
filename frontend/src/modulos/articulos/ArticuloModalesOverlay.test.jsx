import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArticuloDetalleModal } from "./ArticuloDetalleModal";
import { HabilitarArticuloModal } from "../articulo-deposito/HabilitarArticuloModal";

vi.mock("../stock/stock.api", () => ({ consultarStock: vi.fn().mockResolvedValue([]) }));
vi.mock("./articulos.api", () => ({ listarArticulos: vi.fn().mockResolvedValue([]) }));
vi.mock("../articulo-deposito/articuloDeposito.api", () => ({
  listarHabilitaciones: vi.fn().mockResolvedValue([]),
  habilitarArticuloEnDeposito: vi.fn(),
}));

function renderConQuery(ui) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// Estos dos dibujan su propio overlay (no usan <Modal>).
const fondoDe = (titulo) => screen.getByRole("heading", { name: titulo }).closest(".fixed");
const botonXDe = (titulo) => screen.getByRole("heading", { name: titulo }).closest(".border-b").querySelector("button");

describe("HabilitarArticuloModal (formulario con overlay propio)", () => {
  function renderModal() {
    const onClose = vi.fn();
    renderConQuery(<HabilitarArticuloModal depositoId={1} depositoNombre="Central" onClose={onClose} onExito={vi.fn()} />);
    return onClose;
  }

  it("un clic en el fondo no lo cierra", () => {
    const onClose = renderModal();
    fireEvent.click(fondoDe("Habilitar artículos"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("se cierra con la X y con Esc", () => {
    const onClose = renderModal();
    fireEvent.click(botonXDe("Habilitar artículos"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ArticuloDetalleModal (ficha de solo lectura)", () => {
  const ARTICULO = { id: 7, codigo: "ART-7", nombre: "Toalla", categoria: "Blanco", unidadMedida: "UNIDAD", activo: true };

  it("sigue cerrando con un clic en el fondo, y ahora también con Esc", () => {
    const onClose = vi.fn();
    renderConQuery(<ArticuloDetalleModal articulo={ARTICULO} onClose={onClose} onEditar={vi.fn()} />);

    fireEvent.click(fondoDe("Toalla"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
