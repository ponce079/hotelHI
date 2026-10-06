import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

const fondo = () => screen.getByRole("heading", { name: "¿Anular?" }).closest(".fixed");

function renderDialog(props = {}) {
  const onCancelar = vi.fn();
  const onConfirmar = vi.fn();
  render(
    <ConfirmDialog abierto titulo="¿Anular?" mensaje="No se puede deshacer." onConfirmar={onConfirmar} onCancelar={onCancelar} {...props} />
  );
  return { onCancelar, onConfirmar };
}

describe("ConfirmDialog", () => {
  it("confirmación simple: el clic en el fondo cancela", () => {
    const { onCancelar, onConfirmar } = renderDialog();

    fireEvent.click(fondo());

    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("con un campo adentro (children), el clic en el fondo no cancela", () => {
    const { onCancelar } = renderDialog({ children: <textarea aria-label="Motivo" /> });

    fireEvent.click(fondo());

    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("Esc cancela, también con children; Cancelar sigue andando", () => {
    const { onCancelar } = renderDialog({ children: <textarea aria-label="Motivo" /> });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancelar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledTimes(2);
  });

  it("mientras está cargando, ni el fondo ni Esc cancelan", () => {
    const { onCancelar } = renderDialog({ cargando: true });

    fireEvent.click(fondo());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("cerrado, no escucha Esc", () => {
    const { onCancelar } = renderDialog({ abierto: false });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancelar).not.toHaveBeenCalled();
  });
});
