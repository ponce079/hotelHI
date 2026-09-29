import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CotizadorPage } from "./CotizadorPage";
import { useSesion } from "../../lib/sesion";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";
import { cotizarEstadia } from "./tarifas.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("../tipos-habitacion/tiposHabitacion.api", () => ({ listarTiposHabitacion: vi.fn() }));
vi.mock("./tarifas.api", () => ({ cotizarEstadia: vi.fn() }));

const TIPOS = [{ id: 1, nombre: "Doble" }];

const RESULTADO = {
  fechaVenta: "2027-01-05",
  noches: 1,
  estadiaMinimaExigida: 0,
  planes: [
    {
      codigo: "BAR",
      nombre: "Best Available Rate",
      tipo: "BASE",
      reembolsable: true,
      horasCancelacionSinCargo: 48,
      penalidadNoShow: "PRIMERA_NOCHE",
      detalle: [
        {
          fecha: "2027-01-10",
          diaSemana: 0,
          temporadaId: 1,
          temporadaNombre: "Base",
          temporadaNivel: "BASE",
          tarifaId: 1,
          precioBase: 50000,
          adicionalAplicado: 0,
          porcentajeModificador: 0,
          porcentajeDescuentoPlan: 0,
          precioNoche: 50000,
        },
      ],
      total: 50000,
      promedioPorNoche: 50000,
    },
  ],
};

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/tarifas/cotizador"]}>
        <CotizadorPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function completarYCotizar() {
  fireEvent.change(screen.getByLabelText("Tipo de habitación *"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Ingreso *"), { target: { value: "2027-01-10" } });
  fireEvent.change(screen.getByLabelText("Egreso *"), { target: { value: "2027-01-11" } });
  fireEvent.click(screen.getByRole("button", { name: "Cotizar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listarTiposHabitacion.mockResolvedValue(TIPOS);
});

describe("CotizadorPage", () => {
  it("sin permiso (verTarifas) muestra SinPermiso, no el formulario", async () => {
    useSesion.mockReturnValue({ puede: () => false });
    renderPagina();

    expect(await screen.findByText(/no.*permiso/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cotizar" })).not.toBeInTheDocument();
  });

  it("cotiza y muestra los planes con su total y promedio por noche", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    cotizarEstadia.mockResolvedValue(RESULTADO);

    renderPagina();
    await screen.findByText("Doble");
    await completarYCotizar();

    expect(await screen.findByText("Best Available Rate")).toBeInTheDocument();
    // Total y promedio por noche coinciden acá (una sola noche) — aparece 2
    // veces: el total de la tarjeta y el promedio por noche.
    expect(screen.getAllByText("$ 50.000,00")).toHaveLength(2);
    expect(cotizarEstadia).toHaveBeenCalledWith(
      expect.objectContaining({ tipoHabitacionId: 1, fechaIngreso: "2027-01-10", fechaEgreso: "2027-01-11", canal: "RECEPCION" })
    );
  });

  it("un error de negocio se muestra como mensaje legible, no como error técnico", async () => {
    useSesion.mockReturnValue({ puede: () => true });
    cotizarEstadia.mockRejectedValue({ response: { data: { error: "La temporada \"Milagro\" exige una estadía mínima de 3 noches." } } });

    renderPagina();
    await screen.findByText("Doble");
    await completarYCotizar();

    expect(await screen.findByText('La temporada "Milagro" exige una estadía mínima de 3 noches.')).toBeInTheDocument();
    expect(screen.queryByText(/best available rate/i)).not.toBeInTheDocument();
  });
});
