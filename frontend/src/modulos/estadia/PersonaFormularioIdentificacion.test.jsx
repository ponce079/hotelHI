import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersonaFormulario } from "./PersonaFormulario";
import { buscarHuespedPorDocumento } from "../check-in/checkIn.api";

vi.mock("../check-in/checkIn.api", () => ({ buscarHuespedPorDocumento: vi.fn() }));

const reserva = {
  id: 1,
  estado: "Confirmada",
  fechaDesde: "2099-01-10",
  fechaHasta: "2099-01-12",
  habitaciones: [{ id: 7, numero: "101", capacidad: 3 }],
};

const FICHA = {
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "45112902",
  nombreRegistrado: { nombres: "Juan", apellido: "Pérez" },
  nombre: "Juan",
  apellido: "Pérez",
  fechaNacimiento: "1985-03-02",
  nacionalidad: "AR",
  paisResidencia: "AR",
  localidad: "Salta",
  domicilio: "Calle 1",
  telefono: "3875550000",
  email: "juan@correo.com",
  fechaUltimaEstadia: "2026-09-20",
};

function montar(props = {}) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onGuardar = vi.fn();
  render(
    <QueryClientProvider client={cliente}>
      <PersonaFormulario reserva={reserva} onGuardar={onGuardar} onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );
  return { onGuardar };
}

function cargarDocumento(numero) {
  fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "DNI" } });
  fireEvent.change(screen.getByLabelText("País emisor"), { target: { value: "AR" } });
  fireEvent.change(screen.getByLabelText("Número de DNI"), { target: { value: numero } });
}

beforeEach(() => {
  buscarHuespedPorDocumento.mockReset();
});

describe("PersonaFormulario — identificación por documento", () => {
  it("documento existente: trae todos los datos de la ficha, bloquea el nombre y muestra 'Huésped registrado'", async () => {
    buscarHuespedPorDocumento.mockResolvedValue(FICHA);
    montar();
    cargarDocumento("45112902");

    await waitFor(() => expect(screen.getByLabelText("Nombres *")).toHaveValue("Juan"), { timeout: 3000 });
    expect(screen.getByLabelText("Apellido *")).toHaveValue("Pérez");
    expect(screen.getByLabelText("Nombres *")).toBeDisabled();
    expect(screen.getByLabelText("Apellido *")).toBeDisabled();
    expect(screen.getByLabelText(/Correo/)).toHaveValue("juan@correo.com");
    expect(screen.getByLabelText(/Teléfono/)).toHaveValue("3875550000");
    expect(screen.getByText(/Huésped registrado · última estadía: 20\/09\/2026/)).toBeInTheDocument();
  });

  it("documento nuevo (404): 'No hay un huésped registrado con ese documento' y el nombre se carga a mano", async () => {
    buscarHuespedPorDocumento.mockRejectedValue({ response: { status: 404, data: { otrosDocumentos: [] } } });
    montar();
    cargarDocumento("45112999");

    expect(await screen.findByText(/No hay un huésped registrado con ese documento/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombres *")).toBeEnabled();
  });

  it("dato distinto de la ficha: casilla sin tildar; sin tildar no se manda actualizarFicha, tildada sí", async () => {
    buscarHuespedPorDocumento.mockResolvedValue(FICHA);
    const { onGuardar } = montar();
    cargarDocumento("45112902");
    await waitFor(() => expect(screen.getByLabelText("Nombres *")).toHaveValue("Juan"), { timeout: 3000 });
    expect(screen.queryByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: "3875559999" } });
    const casilla = await screen.findByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" });
    expect(casilla).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalled());
    expect(onGuardar.mock.calls[0][0].actualizarFicha).toBeUndefined();
    expect(onGuardar.mock.calls[0][0].telefono).toBe("3875559999");

    onGuardar.mockClear();
    fireEvent.click(casilla);
    fireEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalled());
    expect(onGuardar.mock.calls[0][0].actualizarFicha).toBe(true);
  });
});
