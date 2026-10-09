import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { AlojadosPage } from "./AlojadosPage";

vi.mock("../../lib/api", () => ({ api: { get: vi.fn() } }));

let sesion;
vi.mock("../../lib/sesion", () => ({ useSesion: () => sesion }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const recepcionista = { usuario: "recep", puede: () => true };
const gerente = { usuario: "gerente", puede: (accion) => accion === "verReservas" };

let ids = 0;
function persona(habitacion, reservaId, extra = {}) {
  ids += 1;
  const habitacionId = Number(habitacion);
  return {
    id: ids,
    reservaId,
    nombre: "Ana",
    apellido: "Pérez",
    esTitular: false,
    tipoDocumento: "DNI",
    numeroDocumento: "30124127",
    paisDocumento: "AR",
    motivoSinDocumento: null,
    responsableId: null,
    fechaNacimiento: "1985-03-14T00:00:00.000Z",
    fechaHasta: "2026-10-12T00:00:00.000Z",
    ingresoReal: "2026-10-06T13:17:00.000Z",
    asignaciones: [{ habitacionId, hasta: null }],
    reserva: {
      codigoConfirmacion: `RES-${reservaId}`,
      reservaHabitaciones: [{ habitacionId, habitacion: { id: habitacionId, numero: habitacion, tipoHabitacion: { nombre: "Doble" } } }],
    },
    ...extra,
  };
}

function datos() {
  const laura = persona("412", 7, { nombre: "Laura", apellido: "Lindero", esTitular: true, numeroDocumento: "27999888", fechaHasta: "2026-10-08T00:00:00.000Z" });
  const monica = persona("412", 7, {
    nombre: "Monica",
    apellido: "Lindero",
    tipoDocumento: null,
    numeroDocumento: null,
    paisDocumento: null,
    responsableId: laura.id,
    fechaNacimiento: "2018-01-01T00:00:00.000Z",
    fechaHasta: "2026-10-08T00:00:00.000Z",
  });
  const otra = persona("410", 7, { nombre: "Juan", apellido: "Gómez", esTitular: true, fechaHasta: "2026-10-07T00:00:00.000Z" });
  const lejana = persona("130", 9, { nombre: "Rosa", apellido: "Díaz", esTitular: true });
  return [laura, monica, otra, lejana];
}

function Ubicacion() {
  const { search } = useLocation();
  return <output data-testid="ubicacion">{search}</output>;
}

function renderPagina(inicial = "/personas-alojadas") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[inicial]}>
        <AlojadosPage />
        <Ubicacion />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const pantalla = () => document.querySelector("div.print\\:hidden");

// La tabla existe también con el skeleton: se espera a que lleguen los datos.
async function tablaCargada() {
  await within(pantalla()).findByText("Rosa Díaz");
  return within(pantalla()).getByRole("table");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
  sesion = recepcionista;
  api.get.mockImplementation(async (_url, { params }) => ({ data: params?.q ? datos().slice(0, 1) : datos() }));
});
afterEach(() => vi.useRealTimers());

describe("AlojadosPage", () => {
  it("una fila por habitación, en orden numérico, con titular, menor y aviso de salida", async () => {
    renderPagina();
    const tabla = await tablaCargada();
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(3);
    expect(filas.map((f) => within(f).getAllByRole("cell")[0].textContent)).toEqual(["130Doble", "410Doble", "412Doble"]);
    const fila412 = filas[2];
    expect(fila412).toHaveTextContent("Laura Lindero");
    expect(fila412).toHaveTextContent("TITULAR");
    expect(fila412).toHaveTextContent(/MENOR · 8 AÑOS/i);
    expect(fila412).toHaveTextContent("Sin documento · a cargo de Laura Lindero");
    expect(fila412).not.toHaveTextContent(/ · $/);
    expect(fila412).toHaveTextContent("Sale hoy");
    expect(fila412).toHaveTextContent("jue 8 oct");
    expect(fila412).toHaveTextContent("misma reserva que 410");
    expect(filas[1]).toHaveTextContent("Salida vencida");
    expect(filas[1]).toHaveTextContent("misma reserva que 412");
    expect(filas[0]).toHaveTextContent("quedan 4 noches");
  });

  it("el documento va enmascarado, con país, y el ingreso con día y hora argentinos", async () => {
    renderPagina();
    const tabla = await tablaCargada();
    expect(tabla).toHaveTextContent("DNI •••• 4127 · Argentina");
    expect(tabla.textContent).not.toContain("30124127");
    expect(tabla).toHaveTextContent("mar 6 oct");
    expect(tabla).toHaveTextContent("10:17 h");
  });

  it("los indicadores salen de la lista completa y coinciden con las pestañas", async () => {
    renderPagina();
    await tablaCargada();
    const salenHoy = screen.getByRole("region", { name: "Salen hoy" });
    const vencidas = screen.getByRole("region", { name: "Salidas vencidas" });
    expect(salenHoy).toHaveTextContent("1");
    expect(salenHoy).toHaveTextContent("2 huéspedes");
    expect(vencidas).toHaveTextContent("1");
    expect(screen.getByRole("region", { name: "Habitaciones ocupadas" })).toHaveTextContent("3");
    expect(screen.getByRole("region", { name: "Huéspedes" })).toHaveTextContent("1 menor");
    expect(screen.getByRole("tab", { name: /Salen hoy/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Vencidas/ })).toHaveTextContent("1");
  });

  it("la pestaña filtra en el cliente y queda en la URL; el indicador la activa", async () => {
    const user = userEvent.setup();
    renderPagina();
    await tablaCargada();
    await user.click(screen.getByRole("tab", { name: /Vencidas/ }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("vista=vencidas");
    expect(within(within(pantalla()).getByRole("table")).getAllByRole("row")).toHaveLength(2);
    await user.click(within(screen.getByRole("region", { name: "Salen hoy" })).getByRole("link"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("vista=hoy");
    expect(screen.getByRole("tab", { name: /Salen hoy/ })).toHaveAttribute("aria-selected", "true");
    // Todo el filtrado fue del cliente: solo se pidió la lista completa, una vez.
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("la búsqueda espera 300 ms, va a la URL y no cambia los indicadores", async () => {
    const user = userEvent.setup();
    renderPagina();
    await tablaCargada();
    await user.type(screen.getByRole("searchbox", { name: "Buscar huéspedes en casa" }), "412");
    expect(api.get).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/estadia/alojados", { params: { q: "412" } }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("q=412");
    expect(screen.getByRole("region", { name: "Habitaciones ocupadas" })).toHaveTextContent("3");
  });

  it("sin resultados con búsqueda dice 'Sin resultados para «q»'", async () => {
    api.get.mockImplementation(async (_url, { params }) => ({ data: params?.q ? [] : datos() }));
    renderPagina("/personas-alojadas?q=zzz");
    expect(await screen.findByText("Sin resultados para «zzz»")).toBeInTheDocument();
  });

  it("sin huéspedes en casa", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPagina();
    expect(await screen.findByText("No hay huéspedes en casa")).toBeInTheDocument();
  });

  it("si falla la consulta muestra un mensaje claro con Reintentar", async () => {
    api.get.mockRejectedValueOnce(new Error("red")).mockResolvedValue({ data: datos() });
    const user = userEvent.setup();
    renderPagina();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/No se pudo cargar la lista/);
    await user.click(within(alerta).getByRole("button", { name: "Reintentar" }));
    expect(await tablaCargada()).toBeInTheDocument();
  });

  it("con 500 filas avisa que se muestran los primeros 500", async () => {
    const muchas = Array.from({ length: 500 }, (_, i) => persona(String(100 + (i % 50)), 1000 + (i % 50)));
    api.get.mockResolvedValue({ data: muchas });
    renderPagina();
    expect(await screen.findByText(/Se muestran los primeros 500 huéspedes\. Refiná la búsqueda\./)).toBeInTheDocument();
  }, 20000);

  it("'Ir al check-out' lo ve quien tiene permiso; el gerente solo ve 'Ver reserva' (CA7)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPagina();
    await user.click(await screen.findByRole("button", { name: "Acciones de habitación 130" }));
    expect(screen.getByRole("button", { name: "Ver reserva" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ir al check-out" }));
    expect(mockNavigate).toHaveBeenCalledWith("/check-out/9");
    unmount();

    sesion = gerente;
    renderPagina();
    await user.click(await screen.findByRole("button", { name: "Acciones de habitación 130" }));
    expect(screen.getByRole("button", { name: "Ver reserva" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ir al check-out" })).toBeNull();
  });

  it("hacer clic en la fila lleva al detalle de la reserva; el menú ⋮ no navega", async () => {
    const user = userEvent.setup();
    renderPagina();
    const tabla = await tablaCargada();
    await user.click(await screen.findByRole("button", { name: "Acciones de habitación 130" }));
    expect(mockNavigate).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await user.click(within(tabla).getByText("Rosa Díaz"));
    expect(mockNavigate).toHaveBeenCalledWith("/reservas/9");
  });

  it("sin permiso de ver reservas muestra SinPermiso y no consulta", () => {
    sesion = { usuario: "hk", puede: () => false };
    renderPagina();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("la lista impresa es el in-house completo, sin documentos ni códigos, con usuario y totales (CA8)", async () => {
    renderPagina("/personas-alojadas?vista=vencidas&q=412");
    const impresion = await screen.findByLabelText("Lista para imprimir");
    expect(impresion).toHaveTextContent("Huéspedes en casa — Holiday Inn Salta");
    expect(impresion).toHaveTextContent("por recep");
    expect(impresion).toHaveTextContent("Rosa Díaz");
    expect(impresion).toHaveTextContent("Laura Lindero · TITULAR");
    expect(impresion).toHaveTextContent("Monica Lindero · MENOR");
    expect(impresion).toHaveTextContent("3 habitaciones ocupadas · 4 huéspedes (3 adultos · 1 menor)");
    expect(impresion.textContent).not.toMatch(/RES-|4127|27999888|DNI/);
  });
});
