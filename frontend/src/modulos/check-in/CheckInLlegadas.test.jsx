import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CheckInPage } from "./CheckInPage";
import * as api from "./checkIn.api";
import { hoyEnHoraLocal, sumarDiasISO } from "../../lib/fechas";

// Pantalla de llegadas (HU-118): pestañas, indicadores, aviso de no-show y walk-in desde el botón. El formulario de
// check-in y el walk-in tienen sus propias pruebas (CheckInPage.test.jsx); acá son piezas simuladas.
let permisos = { gestionarCheckIn: true, gestionarReservas: true };
vi.mock("../../lib/sesion", () => ({ useSesion: () => ({ usuario: "recepcion", puede: (accion) => permisos[accion] ?? false }) }));
vi.mock("./checkIn.api");
vi.mock("./reserva/CheckInReserva", () => ({
  CheckInReserva: ({ reservaId, senia }) => <div data-testid="formulario">Formulario de {reservaId} {senia ? "con seña" : "sin seña"}</div>,
}));
vi.mock("./walkin/CheckInWalkIn", () => ({
  CheckInWalkIn: ({ habitacionPreseleccionada }) => (
    <div data-testid="walkin">
      Walk-in {habitacionPreseleccionada}
      <input aria-label="Dato del walk-in" defaultValue="" />
    </div>
  ),
}));

const hoy = hoyEnHoraLocal();
const iso = (dias) => `${sumarDiasISO(hoy, dias)}T00:00:00.000Z`;
const hab = (id, numero, estado = "libre") => ({ id, numero, tipo: "Doble", capacidad: 2, estado, adultos: 2, menores: 0 });

function llegada(id, codigo, nombre, { desde = 0, habitaciones = [hab(id, String(100 + id))], extra = {} } = {}) {
  return {
    id,
    codigoConfirmacion: codigo,
    fechaDesde: iso(desde),
    fechaHasta: iso(desde + 2),
    noches: 2,
    titular: { nombre, tipoDocumento: "DNI", numeroDocumento: `3000000${id}`, paisDocumento: "AR", preferencias: null },
    habitaciones,
    plan: { nombre: "Tarifa flexible", reembolsable: true },
    senia: { registrada: false, importe: 0, medios: [] },
    garantia: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" },
    esWeb: false,
    horaEstimadaLlegada: null,
    solicitudesEspeciales: null,
    ...extra,
  };
}

const RESPUESTA = {
  fecha: hoy,
  anterioresPendientes: 3,
  pendientesNoShow: 2,
  reservas: [
    llegada(1, "AAA111", "Ana Pérez"),
    llegada(2, "BBB222", "Beto Ruiz", { habitaciones: [hab(2, "305", "en limpieza")], extra: { garantia: null } }),
  ],
  atrasadas: [llegada(3, "CCC333", "Carla Díaz", { desde: -1, habitaciones: [hab(3, "403", "ocupada")], extra: { garantia: null } })],
  ingresadasHoy: [
    { ...llegada(4, "DDD444", "Dora Gil"), horaIngreso: new Date().toISOString() },
    { ...llegada(5, "EEE555", "Eva Sosa", { desde: -1 }), horaIngreso: new Date().toISOString() },
  ],
};

function UbicacionActual() {
  const l = useLocation();
  return <div data-testid="ubicacion">{`${l.pathname}${l.search}`}</div>;
}

let queryClient;
function renderizar(ruta = "/check-in") {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>
        <CheckInPage />
        <UbicacionActual />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tarjeta = (nombre) => screen.getByRole("region", { name: nombre });

beforeEach(() => {
  vi.clearAllMocks();
  permisos = { gestionarCheckIn: true, gestionarReservas: true };
  api.listarLlegadas.mockResolvedValue(RESPUESTA);
  api.buscarReservaParaCheckIn.mockResolvedValue({ reserva: { id: 1 }, puedeIniciarCheckIn: true });
});

describe("encabezado y pestañas", () => {
  it("subtítulo sin fecha, botón Walk-in y las tres pestañas con su contador", async () => {
    renderizar();
    expect(await screen.findByText("Llegadas del día, llegadas atrasadas y walk-in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Walk-in" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Walk-in" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Pendientes de hoy/ })).toHaveTextContent("2"));
    expect(screen.getByRole("tab", { name: /Atrasadas/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Ingresadas hoy/ })).toHaveTextContent("2");
    expect(screen.queryByText("Elegí una llegada de la lista para empezar el check-in.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("formulario")).not.toBeInTheDocument();
  });

  it("la pestaña activa vive en ?vista= y cambia el listado", async () => {
    renderizar();
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Carla Díaz")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Atrasadas/ }));
    expect(await screen.findByText("Carla Díaz")).toBeInTheDocument();
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/check-in?vista=atrasadas");
    expect(screen.getByText("Llegada de ayer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Ingresadas hoy/ }));
    expect(await screen.findByText("Dora Gil")).toBeInTheDocument();
    expect(screen.getAllByText(/^Ingresó \d{2}:\d{2} h$/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: /Pendientes de hoy/ }));
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/check-in");
    expect(screen.getByTestId("ubicacion")).not.toHaveTextContent("vista");
  });

  it("entrar con ?vista=ingresadas abre esa pestaña", async () => {
    renderizar("/check-in?vista=ingresadas");
    expect(await screen.findByText("Dora Gil")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ingresadas hoy/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("indicadores", () => {
  it("Llegadas de hoy: X de Y con las ingresadas con llegada hoy; el resto de las tarjetas", async () => {
    renderizar();
    await screen.findByText("Ana Pérez");
    // ingresadas hoy con llegada hoy = 1 (la otra llegaba ayer); pendientes de hoy = 2 -> "1 de 3"
    expect(tarjeta("Llegadas de hoy")).toHaveTextContent("1de 3");
    expect(tarjeta("Llegadas de hoy")).toHaveTextContent("ingresadas · 2 pendientes");
    expect(within(tarjeta("Llegadas de hoy")).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(tarjeta("Habitaciones no listas")).toHaveTextContent("2");
    expect(tarjeta("Habitaciones no listas")).toHaveTextContent("305 en limpieza · 403 ocupada");
    expect(tarjeta("Sin garantía")).toHaveTextContent("2");
    expect(tarjeta("Sin garantía")).toHaveTextContent("tomar tarjeta al ingreso");
    expect(tarjeta("Llegadas atrasadas")).toHaveTextContent("1");
    expect(tarjeta("Llegadas atrasadas")).toHaveTextContent("de ayer · todavía se pueden ingresar");
  });

  it("los indicadores no cambian con la búsqueda", async () => {
    api.listarLlegadas.mockImplementation(async (q) => (q ? { ...RESPUESTA, reservas: [RESPUESTA.reservas[0]], atrasadas: [] } : RESPUESTA));
    renderizar();
    await screen.findByText("Beto Ruiz");
    fireEvent.change(screen.getByLabelText("Buscar llegadas"), { target: { value: "AAA" } });
    await waitFor(() => expect(screen.queryByText("Beto Ruiz")).not.toBeInTheDocument());
    expect(api.listarLlegadas).toHaveBeenCalledWith("AAA");
    expect(tarjeta("Llegadas de hoy")).toHaveTextContent("1de 3");
    expect(tarjeta("Llegadas atrasadas")).toHaveTextContent("1");
  });

  it("los enlaces de las tarjetas llevan a la pestaña que corresponde", async () => {
    renderizar();
    await screen.findByText("Ana Pérez");
    expect(within(tarjeta("Llegadas atrasadas")).getByRole("link")).toHaveAttribute("href", "/check-in?vista=atrasadas");
    expect(within(tarjeta("Habitaciones no listas")).getByRole("link")).toHaveAttribute("href", "/check-in?vista=pendientes");
    expect(within(tarjeta("Sin garantía")).getByRole("link")).toHaveAttribute("href", "/check-in?vista=pendientes");
  });
});

describe("aviso de no-show", () => {
  it("muestra pendientesNoShow y el enlace a /reservas/no-show", async () => {
    renderizar();
    const aviso = await screen.findByRole("note");
    expect(aviso).toHaveTextContent(
      "2 reservas de días anteriores siguen sin ingreso y sin marcar como no presentadas. Las de ayer están en Atrasadas y todavía se pueden ingresar.",
    );
    expect(within(aviso).getByRole("link", { name: "Gestionar no-show →" })).toHaveAttribute("href", "/reservas/no-show");
  });

  it("sin pendientes de no-show no hay aviso", async () => {
    api.listarLlegadas.mockResolvedValue({ ...RESPUESTA, pendientesNoShow: 0, anterioresPendientes: 1 });
    renderizar();
    await screen.findByText("Ana Pérez");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("sin el permiso de la pantalla de no-show, el aviso queda sin enlace", async () => {
    permisos = { gestionarCheckIn: true, gestionarReservas: false };
    renderizar();
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Gestionar no-show/ })).not.toBeInTheDocument();
  });
});

describe("abrir el check-in", () => {
  it("'Iniciar check-in' y el clic en la fila abren el formulario debajo, con la seña de la fila", async () => {
    renderizar();
    fireEvent.click(await screen.findByRole("button", { name: /Iniciar check-in de la reserva AAA111/ }));
    expect(await screen.findByTestId("formulario")).toHaveTextContent("Formulario de 1");
    fireEvent.click(screen.getByText("Beto Ruiz").closest("tr"));
    expect(await screen.findByText(/Formulario de 2/)).toBeInTheDocument();
  });

  it("una atrasada se puede ingresar desde su pestaña", async () => {
    renderizar("/check-in?vista=atrasadas");
    fireEvent.click(await screen.findByRole("button", { name: /Iniciar check-in de la reserva CCC333/ }));
    expect(await screen.findByTestId("formulario")).toHaveTextContent("Formulario de 3");
  });

  it("las filas de Ingresadas hoy no abren el formulario: llevan al detalle", async () => {
    renderizar("/check-in?vista=ingresadas");
    const fila = (await screen.findByText("Dora Gil")).closest("tr");
    expect(within(fila).getByRole("link", { name: "Ver reserva" })).toHaveAttribute("href", "/reservas/4");
    fireEvent.click(fila);
    expect(screen.queryByTestId("formulario")).not.toBeInTheDocument();
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/reservas/4");
  });

  it("?codigo= abre esa reserva", async () => {
    renderizar("/check-in?codigo=AAA111");
    expect(await screen.findByTestId("formulario")).toHaveTextContent("Formulario de 1");
    expect(api.buscarReservaParaCheckIn).toHaveBeenCalledWith({ codigo: "AAA111" });
  });
});

describe("walk-in desde el botón", () => {
  it("reemplaza el listado, conserva lo cargado al volver y ?habitacion= abre directo en walk-in", async () => {
    renderizar();
    await screen.findByText("Ana Pérez");
    expect(screen.queryByTestId("walkin")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    const walkin = await screen.findByTestId("walkin");
    expect(walkin).toBeVisible();
    expect(screen.getByRole("tablist", { hidden: true })).not.toBeVisible();
    fireEvent.change(screen.getByLabelText("Dato del walk-in"), { target: { value: "cargado" } });
    fireEvent.click(screen.getByRole("button", { name: "Volver a llegadas" }));
    expect(screen.getByRole("tablist")).toBeVisible();
    expect(walkin).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(screen.getByLabelText("Dato del walk-in")).toHaveValue("cargado");
  });

  it("con ?habitacion=305 abre el walk-in con esa habitación", async () => {
    renderizar("/check-in?habitacion=305");
    expect(await screen.findByTestId("walkin")).toHaveTextContent("Walk-in 305");
    expect(screen.getByTestId("walkin")).toBeVisible();
  });
});

describe("estados de la pantalla", () => {
  it("vacíos por pestaña", async () => {
    api.listarLlegadas.mockResolvedValue({ fecha: hoy, anterioresPendientes: 0, pendientesNoShow: 0, reservas: [], atrasadas: [], ingresadasHoy: [] });
    renderizar();
    expect(await screen.findByText("No hay llegadas pendientes para hoy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Atrasadas/ }));
    expect(await screen.findByText("No hay llegadas atrasadas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Ingresadas hoy/ }));
    expect(await screen.findByText("Todavía no hubo ingresos hoy")).toBeInTheDocument();
  });

  it("error con reintento", async () => {
    api.listarLlegadas.mockRejectedValueOnce(new Error("sin red"));
    renderizar();
    expect(await screen.findByText("No se pudieron cargar las llegadas.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
  });

  it("mientras carga muestra el esqueleto, sin texto de error", async () => {
    api.listarLlegadas.mockReturnValue(new Promise(() => {}));
    renderizar();
    await waitFor(() => expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0));
    expect(screen.queryByText("No hay llegadas pendientes para hoy")).not.toBeInTheDocument();
  });

  it("sin permiso de check-in no muestra la pantalla", () => {
    permisos = { gestionarCheckIn: false };
    renderizar();
    expect(screen.queryByRole("button", { name: "Walk-in" })).not.toBeInTheDocument();
  });

  it("un check-in confirmado pasa la reserva a Ingresadas hoy y suma al X de Y", async () => {
    renderizar();
    await screen.findByText("Ana Pérez");
    expect(tarjeta("Llegadas de hoy")).toHaveTextContent("1de 3");
    // Después del check-in el backend la saca de las pendientes y la pone en las ingresadas.
    api.listarLlegadas.mockResolvedValue({
      ...RESPUESTA,
      reservas: [RESPUESTA.reservas[1]],
      ingresadasHoy: [{ ...llegada(1, "AAA111", "Ana Pérez"), horaIngreso: new Date().toISOString() }, ...RESPUESTA.ingresadasHoy],
    });
    await queryClient.invalidateQueries({ queryKey: ["check-in"] });
    await waitFor(() => expect(tarjeta("Llegadas de hoy")).toHaveTextContent("2de 3"));
    expect(tarjeta("Llegadas de hoy")).toHaveTextContent("ingresadas · 1 pendiente");
    expect(screen.queryByText("Ana Pérez")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Ingresadas hoy/ }));
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
  });
});
