import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TablaLlegadas } from "./TablaLlegadas";
import { textoSenia } from "./llegadasHelpers";

const HOY = "2099-10-10";

const BASE = {
  id: 1,
  codigoConfirmacion: "AAA111",
  fechaDesde: `${HOY}T00:00:00.000Z`,
  fechaHasta: "2099-10-13T00:00:00.000Z",
  noches: 3,
  titular: { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30512874", paisDocumento: "AR", preferencias: null },
  habitaciones: [{ id: 1, numero: "101", tipo: "Doble", estado: "libre", adultos: 2, menores: 0 }],
  plan: { nombre: "Best Available Rate", reembolsable: true },
  senia: { registrada: false, importe: 0, medios: [] },
  garantia: null,
  esWeb: false,
  horaEstimadaLlegada: null,
  solicitudesEspeciales: null,
};

function renderTabla(reserva, props = {}) {
  return render(
    <MemoryRouter>
      <TablaLlegadas vista="pendientes" filas={[reserva]} cargando={false} hoy={HOY} seleccionadaId={null} onSeleccionar={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe("TablaLlegadas — Garantía: la misma información de siempre en cada caso", () => {
  it("tarjeta en garantía: tipo en la primera línea y marca con últimos 4 en la segunda (nunca 'Sin garantía')", () => {
    renderTabla({ ...BASE, garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" } });
    expect(screen.getByText("Tarjeta en garantía")).toBeInTheDocument();
    expect(screen.getByText("VISA •••• 4242")).toBeInTheDocument();
    expect(screen.queryByText("Sin garantía")).not.toBeInTheDocument();
  });

  it("pago anticipado (prepago o tarifa no reembolsable): 'Prepagada' con el importe y los medios", () => {
    renderTabla({ ...BASE, senia: { registrada: true, concepto: "Pago anticipado", importe: 90000, medios: [{ medioPago: "Transferencia", importe: 90000, referencia: null }] } });
    expect(screen.getByText("Prepagada")).toBeInTheDocument();
    expect(screen.getByText(/Transferencia/)).toBeInTheDocument();
    expect(screen.queryByText("Sin garantía")).not.toBeInTheDocument();
  });

  it("seña (histórica): 'Seña' con el importe y la referencia", () => {
    renderTabla({
      ...BASE,
      senia: { registrada: true, concepto: "Seña", importe: 24000, medios: [{ medioPago: "Tarjeta crédito", importe: 24000, referencia: "VISA ****4242 · aut. 5521" }] },
    });
    expect(screen.getByText("Seña")).toBeInTheDocument();
    expect(screen.getByText("$ 24.000")).toBeInTheDocument();
    expect(screen.getByText("VISA ****4242 · aut. 5521")).toBeInTheDocument();
  });

  it("sin tarjeta ni pago anticipado: 'Sin garantía' en terracota oscuro y 'tomar tarjeta al ingreso'", () => {
    renderTabla(BASE);
    expect(screen.getByText("Sin garantía")).toHaveClass("font-bold", "text-[var(--aviso-texto)]");
    expect(screen.getByText("tomar tarjeta al ingreso")).toBeInTheDocument();
  });

  it("tarjeta y pago anticipado a la vez (reserva web no reembolsable): muestra las dos cosas, con la referencia", () => {
    renderTabla({
      ...BASE,
      garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" },
      senia: { registrada: true, concepto: "Pago anticipado", importe: 190000, medios: [{ medioPago: "Tarjeta crédito", importe: 190000, referencia: "Visa ****4242 · aut. CAP-123456" }] },
    });
    expect(screen.getByText("Tarjeta en garantía")).toBeInTheDocument();
    expect(screen.getByText("Prepagada")).toBeInTheDocument();
    expect(screen.getByText(/aut\. CAP-123456/)).toBeInTheDocument();
    expect(screen.queryByText("Sin garantía")).not.toBeInTheDocument();
  });

  it("textoSenia: sin pagos devuelve null", () => {
    expect(textoSenia({ registrada: false, importe: 0, medios: [] })).toBeNull();
    expect(textoSenia(undefined)).toBeNull();
  });
});

describe("TablaLlegadas — filas", () => {
  it("titular: iniciales, nombre, código en mono, documento enmascarado y país con nombre completo", () => {
    renderTabla(BASE);
    expect(screen.getByText("AP")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("AAA111")).toHaveClass("font-mono");
    const fila = screen.getByText("AAA111").parentElement;
    expect(fila).toHaveTextContent("AAA111 · DNI •••• 2874 · Argentina");
    expect(document.body.textContent).not.toContain("30512874");
  });

  it("reserva web: etiqueta WEB, hora estimada y recuadro con solicitudes y preferencias (primero las solicitudes, recortadas a 120)", () => {
    const larga = "x".repeat(200);
    renderTabla({
      ...BASE,
      esWeb: true,
      horaEstimadaLlegada: "18:30",
      solicitudesEspeciales: larga,
      titular: { ...BASE.titular, preferencias: "Piso alto" },
    });
    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("Llega 18:30")).toBeInTheDocument();
    const notas = screen.getByTitle(larga);
    expect(notas.textContent.length).toBe(120);
    expect(notas.textContent.endsWith("…")).toBe(true);
    const ordenadas = [...notas.parentElement.querySelectorAll("p")].map((p) => p.textContent);
    expect(ordenadas[1]).toBe("Piso alto");
  });

  it("reserva sin datos web ni preferencias: sin etiqueta WEB, sin hora y sin recuadro", () => {
    renderTabla(BASE);
    expect(screen.queryByText("Web")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Llega /)).not.toBeInTheDocument();
  });

  it("reserva web con el nombre declarado distinto de la ficha: conserva el aviso", () => {
    renderTabla({ ...BASE, nombreWebDistinto: true });
    expect(screen.getByText(/El nombre declarado en la web no coincide con la ficha/)).toBeInTheDocument();
  });

  it("estadía con día de la semana, noches, plan y 'No reembolsable'; pax", () => {
    renderTabla({ ...BASE, plan: { nombre: "Tarifa no reembolsable", reembolsable: false }, habitaciones: [{ ...BASE.habitaciones[0], adultos: 2, menores: 1 }] });
    expect(screen.getByText("3 noches · Tarifa no reembolsable")).toBeInTheDocument();
    expect(screen.getByText("No reembolsable")).toBeInTheDocument();
    expect(screen.getByText("2 ad · 1 men")).toBeInTheDocument();
  });

  it("habitación: número en mono, tipo y chip 'Lista' / 'En limpieza' / 'Ocupada'", () => {
    const { unmount } = renderTabla(BASE);
    expect(screen.getByText("101")).toHaveClass("font-mono");
    expect(screen.getByText("Lista")).toBeInTheDocument();
    unmount();
    renderTabla({ ...BASE, habitaciones: [{ ...BASE.habitaciones[0], estado: "en limpieza" }] });
    expect(screen.getByText("En limpieza")).toBeInTheDocument();
  });

  it("'Iniciar check-in' y Enter en la fila abren la reserva; el clic en la fila también", () => {
    const onSeleccionar = vi.fn();
    renderTabla(BASE, { onSeleccionar });
    fireEvent.click(screen.getByRole("button", { name: /Iniciar check-in/ }));
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
    const fila = screen.getByText("Ana Pérez").closest("tr");
    fireEvent.keyDown(fila, { key: "Enter" });
    expect(onSeleccionar).toHaveBeenCalledTimes(2);
    fireEvent.click(fila);
    expect(onSeleccionar).toHaveBeenCalledTimes(3);
    expect(within(fila).getByText("AAA111")).toBeInTheDocument();
  });

  it("flechas arriba y abajo mueven el foco entre filas", () => {
    render(
      <MemoryRouter>
        <TablaLlegadas vista="pendientes" filas={[BASE, { ...BASE, id: 2, codigoConfirmacion: "BBB222" }]} cargando={false} hoy={HOY} onSeleccionar={vi.fn()} />
      </MemoryRouter>,
    );
    const [a, b] = [...document.querySelectorAll("tr[data-reserva]")];
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowDown" });
    expect(b).toHaveFocus();
    fireEvent.keyDown(b, { key: "ArrowUp" });
    expect(a).toHaveFocus();
  });

  it("la fila seleccionada queda resaltada", () => {
    renderTabla(BASE, { seleccionadaId: 1 });
    expect(screen.getByText("Ana Pérez").closest("tr")).toHaveClass("bg-pino-100");
  });
});

describe("TablaLlegadas — atrasadas e ingresadas", () => {
  const ATRASADA = { ...BASE, fechaDesde: "2099-10-09T00:00:00.000Z" };

  it("atrasadas: píldora 'Llegada de ayer' y, si sale hoy, 'Llegada de ayer · sale hoy'", () => {
    const { unmount } = renderTabla(ATRASADA, { vista: "atrasadas" });
    expect(screen.getByText("Llegada de ayer")).toBeInTheDocument();
    unmount();
    renderTabla({ ...ATRASADA, fechaHasta: `${HOY}T00:00:00.000Z` }, { vista: "atrasadas" });
    expect(screen.getByText("Llegada de ayer · sale hoy")).toBeInTheDocument();
  });

  it("ingresadas: chip 'Ingresó HH:MM h' en hora argentina, 'Ver reserva' al detalle, chip neutro 'Ocupada' y sin botón de check-in", () => {
    renderTabla(
      { ...BASE, horaIngreso: "2099-10-10T13:05:00.000Z", habitaciones: [{ ...BASE.habitaciones[0], estado: "ocupada" }] },
      { vista: "ingresadas" },
    );
    expect(screen.getByText("Ingresó 10:05 h")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver reserva" })).toHaveAttribute("href", "/reservas/1");
    expect(screen.getByText("Ocupada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
  });

  it("vacíos por pestaña", () => {
    const { unmount } = renderTabla(BASE, { vista: "pendientes", filas: [] });
    expect(screen.getByText("No hay llegadas pendientes para hoy")).toBeInTheDocument();
    unmount();
    const segunda = renderTabla(BASE, { vista: "atrasadas", filas: [] });
    expect(screen.getByText("No hay llegadas atrasadas")).toBeInTheDocument();
    segunda.unmount();
    renderTabla(BASE, { vista: "ingresadas", filas: [] });
    expect(screen.getByText("Todavía no hubo ingresos hoy")).toBeInTheDocument();
  });
});
