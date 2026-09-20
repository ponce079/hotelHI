import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EstadoHabitacionModal } from "./EstadoHabitacionModal";
import { actualizarEstadoHabitacion } from "./habitaciones.api";

vi.mock("./habitaciones.api", () => ({
  actualizarEstadoHabitacion: vi.fn(),
}));

const HABITACION_OCUPADA = {
  id: 301,
  numero: "301",
  estado: "ocupada",
  activo: true,
};

function renderModal({ soloHousekeeping }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EstadoHabitacionModal
        habitacion={HABITACION_OCUPADA}
        soloHousekeeping={soloHousekeeping}
        onClose={() => {}}
        onExito={() => {}}
      />
    </QueryClientProvider>
  );
}

// Corrección post-auditoría: cambiarEstadoHabitacion no validaba nada según
// el estado de origen, así que se podía mover una habitación "ocupada" a
// "libre"/"en limpieza" sin que exista un check-out real detrás. El fix es
// que el modal ni siquiera ofrezca esas opciones para una habitación
// ocupada — para ningún rol, porque el problema es de integridad de datos,
// no de permisos.
describe("EstadoHabitacionModal — habitación ocupada (sin check-out real)", () => {
  it("Housekeeping no puede elegir 'Libre' ni 'En limpieza': no hay ningún select ni botón de confirmar", () => {
    renderModal({ soloHousekeeping: true });

    expect(screen.getByText(/el cambio de estado ocurre en el check-out/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar estado" })).not.toBeInTheDocument();
  });

  it("Admin tampoco puede elegir 'Libre' ni 'En limpieza': mismo bloqueo, no es una restricción de rol", () => {
    renderModal({ soloHousekeeping: false });

    expect(screen.getByText(/el cambio de estado ocurre en el check-out/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar estado" })).not.toBeInTheDocument();
  });

  it("ninguno de los dos roles llega a invocar la mutación de cambio de estado", () => {
    renderModal({ soloHousekeeping: true });
    renderModal({ soloHousekeeping: false });

    expect(actualizarEstadoHabitacion).not.toHaveBeenCalled();
  });
});

describe("EstadoHabitacionModal — habitación en mantenimiento (sale solo por resolverOrdenMantenimiento)", () => {
  it("no ofrece ningún destino manual, para ningún rol", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <EstadoHabitacionModal
          habitacion={{ id: 23, numero: "23", estado: "mantenimiento", activo: true }}
          soloHousekeeping={false}
          onClose={() => {}}
          onExito={() => {}}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText(/resolver la orden correspondiente/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
