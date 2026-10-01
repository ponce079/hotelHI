import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CheckInWalkIn } from "./CheckInWalkIn";
import { listarHabitacionesLibresAhora, registrarCheckInWalkIn } from "./checkIn.api";
import { cotizarReserva } from "../reservas/reservas.api";
import { listarPlanesTarifarios } from "../tarifas/tarifas.api";

vi.mock('../../lib/sesion',()=>({useSesion:()=>({usuario:'Prueba',puede:()=>true})}));
vi.mock('../estadia/PersonasWalkIn',()=>({PersonasWalkIn:({onChange,reserva})=><button onClick={()=>onChange(reserva.habitaciones.flatMap(h=>Array.from({length:h.adultos+h.menores},(_,i)=>({id:h.id*10+i,habitacionId:h.id,fechaNacimiento:'1990-01-01',fechaDesde:reserva.fechaDesde,fechaHasta:reserva.fechaHasta}))))}>Cargar identidades de prueba</button>}));
// Etapa 4A — cubre lo que el rewrite de este wizard cambió: ocupación
// editable por habitación (ajuste A), un único plan por reserva (no por
// habitación), el total mostrado/enviado viniendo siempre de cotizarReserva
// (nunca calculado a mano en el frontend) y la recotización al 409 (regla 4).

vi.mock("./checkIn.api", () => ({
  listarHabitacionesLibresAhora: vi.fn(),
  registrarCheckInWalkIn: vi.fn(),
}));

vi.mock("../reservas/reservas.api", () => ({ cotizarReserva: vi.fn() }));

vi.mock("../tarifas/tarifas.api", () => ({
  listarPlanesTarifarios: vi.fn().mockResolvedValue([
    { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, activo: true },
  ]),
}));

vi.mock("../tipos-habitacion/tiposHabitacion.api", () => ({
  listarTiposHabitacion: vi.fn().mockResolvedValue([{ id: 10, codigo: "DOBLE", nombre: "Doble", activo: true }]),
}));

const HABITACION_301 = { id: 1, numero: "301", tipo: "Doble", capacidad: 2, piso: 3, planes: [{ codigo: "BAR", nombre: "Best Available Rate", total: 100000, promedioPorNoche: 50000 }] };
const HABITACION_302 = { id: 2, numero: "302", tipo: "Doble", capacidad: 3, piso: 3, planes: [{ codigo: "BAR", nombre: "Best Available Rate", total: 100000, promedioPorNoche: 50000 }] };

const COTIZACION = {
  planes: [{ codigo: "BAR", nombre: "Best Available Rate", total: 150000, promedioPorNoche: 75000, reembolsable: true, horasCancelacionSinCargo: 48 }],
};

function renderWalkIn(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CheckInWalkIn {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listarHabitacionesLibresAhora.mockResolvedValue({ habitaciones: [HABITACION_301, HABITACION_302] });
  cotizarReserva.mockResolvedValue(COTIZACION);
  listarPlanesTarifarios.mockResolvedValue([
    { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, activo: true },
  ]);
});

async function irAPasoHabitacion() {
  renderWalkIn();
  fireEvent.click(screen.getByRole("button", { name: /Ver habitaciones libres/ }));
  await screen.findByText("301");
}

async function elegirHabitacionesYAvanzarAPlan(numeros) {
  await irAPasoHabitacion();
  for (const numero of numeros) fireEvent.click(screen.getByText(numero));
  await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await screen.findByText("Plan tarifario");
  // Espera a que cotizarQuery resuelva y se pinte la tarjeta del plan (si no,
  // las aserciones de total corren mientras todavía dice "Calculando…").
  await screen.findByText("Best Available Rate");
}

async function elegirPlanYAvanzarAHuesped() {
  fireEvent.click(await screen.findByText("Best Available Rate"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await screen.findByLabelText("Nombre y apellido *");
}

async function completarHuespedYAvanzarAGarantia() {
  fireEvent.change(screen.getByLabelText("Nombre y apellido *"), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento del titular *"), {target:{value:"1990-01-01"}});
  fireEvent.change(screen.getByLabelText("Número *"), { target: { value: "30111222" } });
  fireEvent.change(screen.getByLabelText("Contacto (email o teléfono) *"), { target: { value: "ana@mail.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await screen.findByText("Resumen");
}

function confirmarConGarantiaEfectivo() {
  fireEvent.click(screen.getByRole("button",{name:"Cargar identidades de prueba"}));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar check-in" }));
}

describe("CheckInWalkIn — ocupación por habitación", () => {
  it("permite editar adultos/menores de forma independiente por habitación y valida la capacidad de cada una", async () => {
    await irAPasoHabitacion();
    fireEvent.click(screen.getByText("301"));
    fireEvent.click(screen.getByText("302"));

    expect(screen.getByLabelText("Adultos en habitación 301")).toHaveValue(2);
    expect(screen.getByLabelText("Adultos en habitación 302")).toHaveValue(2);

    // Cambiar la 302 no debe afectar a la 301 (estado independiente por habitación).
    fireEvent.change(screen.getByLabelText("Adultos en habitación 302"), { target: { value: "3" } });
    expect(screen.getByLabelText("Adultos en habitación 301")).toHaveValue(2);
    expect(screen.getByLabelText("Adultos en habitación 302")).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();

    // Supera la capacidad de la 302 (3): bloquea el avance de todo el paso.
    fireEvent.change(screen.getByLabelText("Menores en habitación 302"), { target: { value: "1" } });
    expect(screen.getByText("Supera la capacidad (3).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

    // Vuelve a estar dentro de la capacidad: se rehabilita.
    fireEvent.change(screen.getByLabelText("Menores en habitación 302"), { target: { value: "0" } });
    expect(screen.queryByText("Supera la capacidad (3).")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();
  });
});

describe("CheckInWalkIn — plan único por reserva", () => {
  it("cotiza una sola vez para todas las habitaciones elegidas y aplica el mismo plan a toda la reserva", async () => {
    await elegirHabitacionesYAvanzarAPlan(["301", "302"]);

    expect(cotizarReserva).toHaveBeenCalledTimes(1);
    expect(cotizarReserva).toHaveBeenCalledWith(
      expect.objectContaining({
        habitaciones: [
          { habitacionId: 1, adultos: 2, menores: 0 },
          { habitacionId: 2, adultos: 2, menores: 0 },
        ],
      })
    );

    // Un solo plan visible/seleccionable para las dos habitaciones — no hay
    // un selector de plan por habitación.
    expect(screen.getAllByText("Best Available Rate")).toHaveLength(1);

    await elegirPlanYAvanzarAHuesped();
    await completarHuespedYAvanzarAGarantia();
    confirmarConGarantiaEfectivo();

    await waitFor(() => expect(registrarCheckInWalkIn).toHaveBeenCalledTimes(1));
    const payload = registrarCheckInWalkIn.mock.calls[0][0];
    expect(payload.planTarifarioId).toBe(1);
    expect(payload.habitaciones).toEqual([
      { habitacionId: 1, adultos: 2, menores: 0 },
      { habitacionId: 2, adultos: 2, menores: 0 },
    ]);
  });
});

describe("CheckInWalkIn — total desde el backend", () => {
  it("muestra y envía el total que devuelve cotizarReserva, sin recalcularlo en el frontend", async () => {
    await elegirHabitacionesYAvanzarAPlan(["301"]);

    expect(screen.getByText(/150\.000/)).toBeInTheDocument();

    await elegirPlanYAvanzarAHuesped();
    await completarHuespedYAvanzarAGarantia();

    // El resumen del paso Garantía también usa el total del backend.
    expect(screen.getByText(/150\.000/)).toBeInTheDocument();

    confirmarConGarantiaEfectivo();

    await waitFor(() => expect(registrarCheckInWalkIn).toHaveBeenCalledTimes(1));
    expect(registrarCheckInWalkIn.mock.calls[0][0].totalEsperado).toBe(150000);
  });
});

describe("CheckInWalkIn — manejo del 409 (precio cambió al confirmar)", () => {
  it("si el backend rechaza con 409, recotiza y vuelve al paso Plan con la selección limpia", async () => {
    registrarCheckInWalkIn.mockRejectedValueOnce({
      response: { status: 409, data: { error: "El precio cambió, volvé a elegir el plan." } },
    });

    await elegirHabitacionesYAvanzarAPlan(["301"]);
    await elegirPlanYAvanzarAHuesped();
    await completarHuespedYAvanzarAGarantia();
    confirmarConGarantiaEfectivo();

    await screen.findByText("El precio cambió, volvé a elegir el plan.");
    await screen.findByText("Plan tarifario");

    // Recotiza (segunda llamada) y la selección de plan quedó limpia.
    await waitFor(() => expect(cotizarReserva).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });
});
