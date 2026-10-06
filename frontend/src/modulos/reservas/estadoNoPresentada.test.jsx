// Estado "No-show" en las pantallas de reservas: se ve como "No presentada", en la misma familia visual
// que Cancelada, y sin acciones.
import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  ESTADO_RESERVA,
  ESTADO_RESERVA_BADGE,
  ESTADO_RESERVA_COLOR,
  ESTADOS_RESERVA,
  construirPasosReserva,
  etiquetaEstadoReserva,
} from "./reservas.constantes";
import { lineaDeTiempo } from "./detalle/reservaDetalle";
import { PestanaHuespedes } from "./detalle/PestanaHuespedes";

describe("constantes del estado No-show", () => {
  it("se muestra como 'No presentada' y los demás estados no cambian", () => {
    expect(etiquetaEstadoReserva("No-show")).toBe("No presentada");
    for (const e of ["Confirmada", "En curso", "Cerrada", "Cancelada"]) expect(etiquetaEstadoReserva(e)).toBe(e);
    // El valor que viaja al backend sigue siendo "No-show".
    expect(ESTADO_RESERVA.NO_SHOW).toBe("No-show");
    expect(ESTADOS_RESERVA).toContain("No-show");
  });

  it("misma familia visual que Cancelada: badge y colores", () => {
    expect(ESTADO_RESERVA_BADGE["No-show"]).toBe(ESTADO_RESERVA_BADGE.Cancelada);
    expect(ESTADO_RESERVA_COLOR["No-show"]).toEqual(ESTADO_RESERVA_COLOR.Cancelada);
  });

  it("la barra de pasos y la línea de tiempo dicen 'No presentada'", () => {
    expect(construirPasosReserva({ estado: "No-show" }).pasoAlternativo).toEqual({ label: "No presentada", activo: true });
    expect(construirPasosReserva({ estado: "Cancelada" }).pasoAlternativo).toEqual({ label: "Cancelada", activo: true });
    expect(lineaDeTiempo({ estado: "No-show" }).map((p) => p.texto)).toEqual(["Confirmada", "No presentada"]);
  });
});

describe("PestanaHuespedes con la reserva No presentada", () => {
  const persona = {
    id: 1,
    nombre: "Ana",
    apellido: "Pérez",
    estado: "Previsto",
    verificadoEn: null,
    fechaNacimiento: null,
    esTitular: false,
    tipoDocumento: "DNI",
    numeroDocumento: "30111222",
    asignaciones: [{ habitacionId: 1, hasta: null }],
  };
  const estadia = {
    listado: [persona],
    todas: [persona],
    personas: { isLoading: false, isSuccess: true },
    titular: { isPending: false, data: null },
    titularDeLaReservaActivo: null,
    preparandoTitular: false,
    errorCargaPersonas: null,
    cargandoPersonas: false,
    error: null,
    puedeEditar: false,
  };

  function renderPestana(estado) {
    const reserva = { id: 5, estado, huesped: { nombre: "Ana Pérez" }, habitaciones: [{ id: 1, numero: "101", tipo: "Doble", adultos: 1, menores: 0, capacidad: 2 }] };
    return render(
      <MemoryRouter>
        <PestanaHuespedes reserva={reserva} estadia={estadia} />
      </MemoryRouter>
    );
  }

  it("igual que Cancelada: no marca a nadie 'Por verificar'", () => {
    const confirmada = renderPestana("Confirmada");
    expect(within(confirmada.container).getByText("Por verificar")).toBeInTheDocument();
    confirmada.unmount();
    for (const estado of ["Cancelada", "No-show"]) {
      const r = renderPestana(estado);
      expect(within(r.container).queryByText("Por verificar")).not.toBeInTheDocument();
      r.unmount();
    }
  });
});
