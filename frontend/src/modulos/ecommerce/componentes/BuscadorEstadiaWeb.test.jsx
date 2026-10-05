// Buscador con las props de la etapa 2 (sin ellas, ver BuscadorEstadia.test.jsx).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BuscadorEstadia, validarBusquedaWeb } from "./BuscadorEstadia";

const HOY = "2026-10-04";

function renderWeb(props = {}) {
  const onBuscar = vi.fn();
  render(
    <BuscadorEstadia
      hoy={HOY}
      valoresIniciales={{ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 }}
      onBuscar={onBuscar}
      capacidadMaxima={3}
      ventanaVentaDias={365}
      menoresConEdad
      fechasLegibles
      {...props}
    />
  );
  return onBuscar;
}

describe("validarBusquedaWeb", () => {
  it("ventana de venta de 365 días", () => {
    expect(validarBusquedaWeb({ fechaDesde: "2027-10-04", fechaHasta: "2027-10-05", adultos: 2, menores: 0 }, { hoy: HOY, ventanaVentaDias: 365 }).fechaHasta).toMatch(
      /un año/
    );
    expect(validarBusquedaWeb({ fechaDesde: "2027-10-03", fechaHasta: "2027-10-04", adultos: 2, menores: 0 }, { hoy: HOY, ventanaVentaDias: 365 })).toEqual({});
  });
  it("adultos + menores no superan la capacidad máxima", () => {
    expect(validarBusquedaWeb({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 2 }, { hoy: HOY, capacidadMaxima: 3 }).menores).toBe(
      "Para más de 3 personas, contactá a recepción."
    );
  });
});

describe("<BuscadorEstadia> web", () => {
  it("menores con su rótulo y su ayuda asociada", () => {
    renderWeb();
    const menores = screen.getByLabelText("Menores (0 a 12 años)");
    expect(document.getElementById(menores.getAttribute("aria-describedby"))).toHaveTextContent("Desde los 13 años cuentan como adultos");
  });

  it("adultos de 1 a la capacidad máxima y menores hasta capacidad − 1", () => {
    renderWeb();
    expect(within(screen.getByLabelText("Adultos")).getAllByRole("option").map((o) => o.value)).toEqual(["1", "2", "3"]);
    expect(within(screen.getByLabelText("Menores (0 a 12 años)")).getAllByRole("option").map((o) => o.value)).toEqual(["0", "1", "2"]);
  });

  it("fechas legibles: el texto superpuesto es aria-hidden y el input conserva su label, su valor y sus límites", () => {
    renderWeb();
    const entrada = screen.getByLabelText("Entrada");
    expect(entrada).toHaveAttribute("type", "date");
    expect(entrada).toHaveValue("2026-10-16");
    expect(entrada).toHaveAttribute("min", HOY);
    expect(entrada).toHaveAttribute("max", "2027-10-04");
    const legible = screen.getByText("Vie 16 oct 2026");
    expect(legible).toHaveAttribute("aria-hidden", "true");
  });

  it("más personas que la capacidad: error junto al campo, con aria-describedby, y no busca", () => {
    const onBuscar = renderWeb();
    fireEvent.change(screen.getByLabelText("Adultos"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Menores (0 a 12 años)"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /ver disponibilidad/i }));
    expect(onBuscar).not.toHaveBeenCalled();
    const menores = screen.getByLabelText("Menores (0 a 12 años)");
    expect(menores).toHaveAttribute("aria-invalid", "true");
    expect(menores.getAttribute("aria-describedby")).toMatch(/-error/);
    expect(screen.getByText("Para más de 3 personas, contactá a recepción.")).toBeInTheDocument();
  });

  it("erroresExternos marca el campo (por ejemplo, un DATOS_INVALIDOS de la API)", () => {
    renderWeb({ erroresExternos: { fechaHasta: "La estadía no puede superar las 30 noches." } });
    expect(screen.getByLabelText("Salida")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("La estadía no puede superar las 30 noches.")).toBeInTheDocument();
  });

  it("busca con valores válidos", () => {
    const onBuscar = renderWeb();
    fireEvent.click(screen.getByRole("button", { name: /ver disponibilidad/i }));
    expect(onBuscar).toHaveBeenCalledWith({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 });
  });
});
