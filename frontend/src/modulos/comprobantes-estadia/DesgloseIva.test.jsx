import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesgloseIva } from "./DesgloseIva";

describe("DesgloseIva", () => {
  it("consumidor final: IVA contenido y leyenda, sin importe neto", () => {
    render(<DesgloseIva importeNeto="96528.93" importeIVA="20271.07" alicuotaIVA="21" esEmpresa={false} />);
    expect(screen.getByText("IVA contenido:")).toBeInTheDocument();
    expect(screen.getByText("$ 20.271,07")).toBeInTheDocument();
    expect(screen.getByText(/Ley 27\.743/)).toBeInTheDocument();
    expect(screen.queryByText("Importe neto")).not.toBeInTheDocument();
  });

  it("empresa: neto e IVA por separado, sin leyenda", () => {
    render(<DesgloseIva importeNeto="96528.93" importeIVA="20271.07" alicuotaIVA="21" esEmpresa />);
    expect(screen.getByText("Importe neto")).toBeInTheDocument();
    expect(screen.getByText("$ 96.528,93")).toBeInTheDocument();
    expect(screen.getByText("IVA 21 %")).toBeInTheDocument();
    expect(screen.getByText("$ 20.271,07")).toBeInTheDocument();
    expect(screen.queryByText(/IVA contenido/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ley 27\.743/)).not.toBeInTheDocument();
  });
});
