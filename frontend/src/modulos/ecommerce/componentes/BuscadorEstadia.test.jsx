import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BuscadorEstadia, validarBusqueda } from "./BuscadorEstadia";

const HOY = "2026-10-01";

describe("validarBusqueda", () => {
  const valida = { fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 };

  it("acepta una búsqueda válida (incluida la entrada hoy)", () => {
    expect(validarBusqueda(valida, HOY)).toEqual({});
    expect(validarBusqueda({ ...valida, fechaDesde: HOY, fechaHasta: "2026-10-02" }, HOY)).toEqual({});
  });

  it("rechaza una entrada anterior a hoy", () => {
    expect(validarBusqueda({ ...valida, fechaDesde: "2026-09-30" }, HOY).fechaDesde).toMatch(/anterior a hoy/);
  });

  it("exige salida posterior a la entrada", () => {
    expect(validarBusqueda({ ...valida, fechaHasta: "2026-10-16" }, HOY).fechaHasta).toMatch(/posterior a la entrada/);
    expect(validarBusqueda({ ...valida, fechaHasta: "2026-10-10" }, HOY).fechaHasta).toMatch(/posterior a la entrada/);
  });

  it("exige al menos 1 adulto", () => {
    expect(validarBusqueda({ ...valida, adultos: 0 }, HOY).adultos).toMatch(/al menos 1 adulto/);
  });

  it("acepta hasta 30 noches y rechaza 31", () => {
    expect(validarBusqueda({ ...valida, fechaDesde: "2026-10-16", fechaHasta: "2026-11-15" }, HOY)).toEqual({});
    expect(validarBusqueda({ ...valida, fechaDesde: "2026-10-16", fechaHasta: "2026-11-16" }, HOY).fechaHasta).toMatch(/30 noches/);
  });

  it("pide las fechas si faltan", () => {
    const errores = validarBusqueda({ fechaDesde: "", fechaHasta: "", adultos: 2, menores: 0 }, HOY);
    expect(errores.fechaDesde).toBeTruthy();
    expect(errores.fechaHasta).toBeTruthy();
  });
});

describe("<BuscadorEstadia>", () => {
  it("muestra los errores asociados al campo y no busca", () => {
    const onBuscar = vi.fn();
    render(<BuscadorEstadia hoy={HOY} valoresIniciales={{ fechaDesde: "2026-09-20", fechaHasta: "2026-09-22" }} onBuscar={onBuscar} />);
    fireEvent.click(screen.getByRole("button", { name: /ver disponibilidad/i }));

    expect(onBuscar).not.toHaveBeenCalled();
    const entrada = screen.getByLabelText("Entrada");
    expect(entrada).toHaveAttribute("aria-invalid", "true");
    const idError = entrada.getAttribute("aria-describedby");
    expect(document.getElementById(idError)).toHaveTextContent(/anterior a hoy/);
  });

  it("busca con valores numéricos cuando todo es válido", () => {
    const onBuscar = vi.fn();
    render(<BuscadorEstadia hoy={HOY} valoresIniciales={{ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18" }} onBuscar={onBuscar} />);
    fireEvent.change(screen.getByLabelText("Adultos"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Menores"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /ver disponibilidad/i }));

    expect(onBuscar).toHaveBeenCalledWith({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 3, menores: 1 });
  });

  it("al elegir una entrada posterior a la salida, propone la noche siguiente", () => {
    render(<BuscadorEstadia hoy={HOY} valoresIniciales={{ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18" }} onBuscar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Entrada"), { target: { value: "2026-10-20" } });
    expect(screen.getByLabelText("Salida")).toHaveValue("2026-10-21");
  });
});
