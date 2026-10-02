import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmarAmpliacion } from "./ConfirmarAmpliacion";

it("muestra el cambio y solo envía la aceptación al presionar el botón", () => {
  const onConfirmar = vi.fn();
  render(
    <ConfirmarAmpliacion
      onConfirmar={onConfirmar}
      respuesta={{
        codigo: "AMPLIACION_OCUPACION_REQUIERE_CONFIRMACION",
        detalle: {
          totalAnterior: 200000,
          totalNuevo: 220000,
          diferencia: 20000,
          token: "cotizacion-vigente",
          mensajeAjustePerdido: "Se perderá el ajuste manual.",
        },
      }}
    />,
  );
  expect(screen.getByText("Nuevo total")).toBeInTheDocument();
  expect(screen.getByText("Se perderá el ajuste manual.")).toBeInTheDocument();
  expect(onConfirmar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Aceptar nueva cotización/ }));
  expect(onConfirmar).toHaveBeenCalledWith("cotizacion-vigente");
});
