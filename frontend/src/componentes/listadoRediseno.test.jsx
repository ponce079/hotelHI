import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Pestanas } from "./Pestanas";
import { Paginacion, paginasVisibles } from "./Paginacion";
import { Table } from "./Table";
import { TarjetaIndicador } from "./TarjetaIndicador";
import { Badge } from "./Badge";

describe("Pestanas", () => {
  const pestanas = [
    { valor: "", etiqueta: "Todas", cantidad: 10 },
    { valor: "A", etiqueta: "Alfa", cantidad: 3 },
    { valor: "B", etiqueta: "Beta", cantidad: 0 },
  ];

  it("es un tablist con la pestaña activa seleccionada y su contador", () => {
    render(<Pestanas pestanas={pestanas} activa="A" onCambiar={() => {}} etiqueta="Estados" />);
    expect(screen.getByRole("tablist", { name: "Estados" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Alfa/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Todas/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /Alfa/ })).toHaveTextContent("3");
  });

  it("flechas mueven el foco y Enter activa; solo la activa entra con Tab", async () => {
    const onCambiar = vi.fn();
    render(<Pestanas pestanas={pestanas} activa="" onCambiar={onCambiar} etiqueta="Estados" />);
    const user = userEvent.setup();
    expect(screen.getByRole("tab", { name: /Alfa/ })).toHaveAttribute("tabindex", "-1");
    screen.getByRole("tab", { name: /Todas/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Alfa/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /Beta/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onCambiar).toHaveBeenCalledWith("B");
  });
});

describe("Paginacion", () => {
  it("muestra el rango y la página actual", () => {
    render(<Paginacion pagina={2} paginas={5} total={203} tamano={50} onCambiar={() => {}} nombre="reservas" />);
    expect(screen.getByText("Mostrando 51–100 de 203")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página 2" })).toHaveAttribute("aria-current", "page");
  });

  it("deshabilita anterior en la primera página y cambia de página", async () => {
    const onCambiar = vi.fn();
    render(<Paginacion pagina={1} paginas={3} total={120} tamano={50} onCambiar={onCambiar} />);
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(onCambiar).toHaveBeenCalledWith(2);
  });

  it("sin controles si hay una sola página, y nada si no hay resultados", () => {
    const { rerender } = render(<Paginacion pagina={1} paginas={1} total={7} tamano={50} onCambiar={() => {}} />);
    expect(screen.getByText("Mostrando 1–7 de 7")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<Paginacion pagina={1} paginas={1} total={0} tamano={50} onCambiar={() => {}} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("paginasVisibles abrevia con puntos suspensivos", () => {
    expect(paginasVisibles(1, 3)).toEqual([1, 2, 3]);
    expect(paginasVisibles(5, 12)).toEqual([1, null, 4, 5, 6, null, 12]);
    expect(paginasVisibles(1, 12)).toEqual([1, 2, null, 12]);
  });
});

describe("Table (opciones del rediseño)", () => {
  const filas = [{ id: 1, nombre: "Ana" }];
  const renderFila = (f) => (
    <tr key={f.id}>
      <td>{f.nombre}</td>
      <td>
        <button type="button">Menú</button>
      </td>
    </tr>
  );

  it("sin las props nuevas se comporta como siempre (texto vacío)", () => {
    render(<Table columnas={["Nombre", ""]} filas={[]} renderFila={renderFila} vacio="Nada por acá." />);
    expect(screen.getByText("Nada por acá.")).toBeInTheDocument();
  });

  it("estado vacío con título y descripción", () => {
    render(<Table columnas={["Nombre"]} filas={[]} renderFila={renderFila} vacioTitulo="Sin datos" vacioDescripcion="Cambiá el filtro." />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.getByText("Cambiá el filtro.")).toBeInTheDocument();
  });

  it("onRowClick se dispara al tocar la fila pero no al tocar un botón de la fila", async () => {
    const onRowClick = vi.fn();
    render(<Table columnas={["Nombre", ""]} filas={filas} renderFila={renderFila} onRowClick={onRowClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Menú" }));
    expect(onRowClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("Ana"));
    expect(onRowClick).toHaveBeenCalledWith(filas[0]);
  });

  it("cargando dibuja filas de relleno ocultas a lectores de pantalla", () => {
    const { container } = render(<Table columnas={["Nombre"]} filas={[]} renderFila={renderFila} cargando filasSkeleton={3} />);
    expect(container.querySelectorAll("tbody tr[aria-hidden='true']")).toHaveLength(3);
  });
});

describe("TarjetaIndicador y Badge", () => {
  it("sin valor muestra —", () => {
    render(
      <MemoryRouter>
        <TarjetaIndicador color="red" etiqueta="Llegadas hoy" valor={null} enlace={{ texto: "Check-in →", to: "/check-in" }} secundaria="pendientes" />
      </MemoryRouter>
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check-in →" })).toHaveAttribute("href", "/check-in");
  });

  it("el cero es un valor, no una falla", () => {
    render(
      <MemoryRouter>
        <TarjetaIndicador color="red" etiqueta="X" valor={0} secundaria="s" />
      </MemoryRouter>
    );
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("Badge con tono usa el chip; sin tono conserva la variante de siempre", () => {
    const { container } = render(
      <>
        <Badge tono="en-curso">En curso</Badge>
        <Badge variante="error">Anulada</Badge>
      </>
    );
    expect(screen.getByText("En curso")).toHaveClass("chip-estado", "chip-en-curso");
    expect(container.querySelector(".bg-error-suave")).toHaveTextContent("Anulada");
  });
});
