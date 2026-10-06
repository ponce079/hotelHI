import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";
import { ConfirmDialog } from "./ConfirmDialog";

const fondo = () => screen.getByRole("dialog").parentElement;

describe("Modal", () => {
  it("un clic en el fondo no lo cierra", () => {
    const onClose = vi.fn();
    render(<Modal titulo="Nueva reserva" onClose={onClose}><input aria-label="Dato" /></Modal>);

    fireEvent.click(fondo());

    expect(onClose).not.toHaveBeenCalled();
  });

  it("un clic dentro del contenido tampoco lo cierra", () => {
    const onClose = vi.fn();
    render(<Modal titulo="Nueva reserva" onClose={onClose}><input aria-label="Dato" /></Modal>);

    fireEvent.click(screen.getByLabelText("Dato"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("se cierra con la X", () => {
    const onClose = vi.fn();
    render(<Modal titulo="Nueva reserva" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("se cierra con Esc, y otra tecla no hace nada", () => {
    const onClose = vi.fn();
    render(<Modal titulo="Nueva reserva" onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("con cerrarAlClickFuera, el clic en el fondo sí lo cierra (comportamiento anterior)", () => {
    const onClose = vi.fn();
    render(<Modal titulo="Detalle" onClose={onClose} cerrarAlClickFuera />);

    fireEvent.click(fondo());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("al cerrarse deja de escuchar Esc", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Modal titulo="Nueva reserva" onClose={onClose} />);

    unmount();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("con un ConfirmDialog abierto encima, Esc cierra solo el de arriba", () => {
    const onClose = vi.fn();
    const onCancelar = vi.fn();
    const { rerender } = render(
      <Modal titulo="Nueva reserva" onClose={onClose}>
        <ConfirmDialog abierto titulo="¿Descartar?" mensaje="Se pierden los cambios." onConfirmar={vi.fn()} onCancelar={onCancelar} />
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    // Cerrado el diálogo, el siguiente Esc ya es para el modal.
    rerender(
      <Modal titulo="Nueva reserva" onClose={onClose}>
        <ConfirmDialog abierto={false} titulo="¿Descartar?" mensaje="" onConfirmar={vi.fn()} onCancelar={onCancelar} />
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
