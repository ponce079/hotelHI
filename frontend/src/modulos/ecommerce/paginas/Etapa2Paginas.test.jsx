// Etapa 2: Inicio, Resultados y Detalle del tipo terminados. La API se
// reemplaza por dobles para controlar cada estado (carga, error, vacío,
// agotado, doble clic).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "../../../App";
import { CLAVE_STORAGE } from "../ProcesoCompraContext";
import { consultarDisponibilidad, cotizar, obtenerPlanes, obtenerTipos } from "../ecommerce.api";
import { hoyEnHoraLocal } from "../../../lib/fechas";

vi.mock("../../../lib/sesion", () => ({ useSesion: () => ({ rol: null }) }));
vi.mock("../ecommerce.api", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, obtenerTipos: vi.fn(), obtenerPlanes: vi.fn(), consultarDisponibilidad: vi.fn(), cotizar: vi.fn() };
});

function dia(desplazamiento) {
  const [a, m, d] = hoyEnHoraLocal().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + desplazamiento)).toISOString().slice(0, 10);
}
const ENTRADA = dia(12);
const SALIDA = dia(14);
const QUERY = `entrada=${ENTRADA}&salida=${SALIDA}&adultos=2&menores=0`;

const TIPOS = {
  tipos: [
    { tipoHabitacionId: 1, nombre: "Simple", capacidadMaxima: 2 },
    { tipoHabitacionId: 2, nombre: "Doble", capacidadMaxima: 4 },
  ],
};
const PLANES = {
  planes: [
    { planTarifarioId: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
    { planTarifarioId: 2, codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: null, penalidadNoShow: "TOTAL_ESTADIA" },
  ],
};
const planDe = (id, total) => ({
  ...PLANES.planes[id - 1],
  total,
  promedioPorNoche: total / 2,
});
const disponibleTipo = (id, nombre, bar, nrf, extra = {}) => ({
  tipoHabitacionId: id,
  nombre,
  capacidadMaxima: id === 1 ? 2 : 4,
  ultimasDisponibles: false,
  desdePorNoche: nrf / 2,
  planes: [planDe(1, bar), planDe(2, nrf)],
  motivoNoDisponible: null,
  ...extra,
});
const noDisponibleTipo = (id, nombre, motivo) => ({
  tipoHabitacionId: id,
  nombre,
  capacidadMaxima: id === 1 ? 2 : 4,
  ultimasDisponibles: false,
  desdePorNoche: null,
  planes: [],
  motivoNoDisponible: motivo,
});
const DISPONIBILIDAD = {
  fechaDesde: ENTRADA,
  fechaHasta: SALIDA,
  noches: 2,
  // A propósito en orden "malo": la Doble (más cara) primero y la Simple no disponible.
  tipos: [disponibleTipo(2, "Doble", 50000, 42500), disponibleTipo(1, "Simple", 40000, 34000)],
};

function Ubicacion() {
  const { pathname, search } = useLocation();
  return <output data-testid="ruta">{pathname + search}</output>;
}

function renderRuta(ruta) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>
        <App />
        <Ubicacion />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const tarjetas = () => screen.getAllByRole("article").map((a) => within(a).getByRole("heading", { level: 2 }).textContent);

beforeEach(() => {
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  obtenerTipos.mockReset().mockResolvedValue(TIPOS);
  obtenerPlanes.mockReset().mockResolvedValue(PLANES);
  consultarDisponibilidad.mockReset().mockResolvedValue(DISPONIBILIDAD);
  cotizar.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Inicio", () => {
  it("tipos reales sin precio, título de la pestaña y buscador con la capacidad de /tipos", async () => {
    renderRuta("/web");
    expect(await screen.findByRole("heading", { name: "Doble" })).toBeInTheDocument();
    expect(screen.queryByText(/\$\s?\d/)).not.toBeInTheDocument();
    expect(document.title).toBe("Reservá directo · Holiday Inn Salta");
    expect(screen.getByLabelText("Menores (0 a 12 años)")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByLabelText("Adultos")).getAllByRole("option")).toHaveLength(4));
    expect(screen.getByRole("link", { name: "Ver habitación Doble" })).toHaveAttribute("href", "/web/habitacion/2");
    expect(screen.getByText("Hasta las 10 h")).toBeInTheDocument();
  });

  it("si /tipos falla, error con 'Reintentar' solo en las tarjetas", async () => {
    obtenerTipos.mockRejectedValueOnce({ codigo: "ERROR_RED", mensaje: "x", status: 0 });
    renderRuta("/web");
    fireEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    expect(await screen.findByRole("heading", { name: "Simple" })).toBeInTheDocument();
    expect(obtenerTipos).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1, name: /tu estadía/i })).toBeInTheDocument();
  });

  it("buscar lleva a /web/resultados con la búsqueda en la URL", async () => {
    renderRuta("/web");
    await screen.findByRole("heading", { name: "Doble" });
    fireEvent.change(screen.getByLabelText("Entrada"), { target: { value: ENTRADA } });
    fireEvent.change(screen.getByLabelText("Salida"), { target: { value: SALIDA } });
    fireEvent.click(screen.getByRole("button", { name: /ver disponibilidad/i }));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(`/web/resultados?${QUERY}`));
  });
});

describe("Resultados", () => {
  it("disponibles primero por precio, no disponibles al final, ahorro real y resumen sin ceros", async () => {
    consultarDisponibilidad.mockResolvedValue({
      ...DISPONIBILIDAD,
      tipos: [noDisponibleTipo(1, "Simple", "Admite hasta 2 personas"), disponibleTipo(2, "Doble", 50000, 42500)],
    });
    renderRuta(`/web/resultados?${QUERY}`);
    await screen.findByRole("heading", { name: "Doble", level: 2 });
    expect(tarjetas()).toEqual(["Doble", "Simple"]);
    expect(screen.getByRole("article", { name: "Simple" })).toHaveAttribute("aria-disabled", "true");
    expect(within(screen.getByRole("article", { name: "Simple" })).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Ahorrás $ 7.500")).toBeInTheDocument();
    expect(screen.getByText("$ 21.250 por noche · 2 noches")).toBeInTheDocument();
    expect(screen.getByText(/· 2 noches · 2 adultos$/)).toBeInTheDocument();
    expect(document.title).toBe("Habitaciones disponibles · Holiday Inn Salta");
  });

  it("criterios de HU-99: cada tipo con descripción, capacidad, 'desde $ X por noche' y no-show de cada plan", async () => {
    renderRuta(`/web/resultados?${QUERY}`);
    const doble = within(await screen.findByRole("article", { name: "Doble" }));
    expect(doble.getByText(/Más espacio para parejas/)).toBeInTheDocument();
    expect(doble.getByText(/Hasta 4 personas/).textContent).toMatch(/Desde \$\s?21\.250 por noche/);
    expect(doble.getByText("Si no te presentás, se cobra la primera noche.")).toBeInTheDocument();
    expect(doble.getByText("Si no te presentás, se cobra el total de la estadía.")).toBeInTheDocument();
  });

  it("ordena por desdePorNoche: la Simple (más barata) antes que la Doble", async () => {
    renderRuta(`/web/resultados?${QUERY}`);
    await screen.findByRole("heading", { name: "Doble", level: 2 });
    expect(tarjetas()).toEqual(["Simple", "Doble"]);
  });

  it("esqueletos mientras responde la API", async () => {
    consultarDisponibilidad.mockReturnValue(new Promise(() => {}));
    renderRuta(`/web/resultados?${QUERY}`);
    const anuncio = await screen.findByText("Buscando disponibilidad…");
    expect(anuncio.closest("[role=status]")).toHaveClass("ec-esqueletos");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("ningún tipo disponible: estado vacío con el motivo más relevante y el teléfono de recepción", async () => {
    consultarDisponibilidad.mockResolvedValue({
      ...DISPONIBILIDAD,
      tipos: [noDisponibleTipo(1, "Simple", "Admite hasta 2 personas"), noDisponibleTipo(2, "Doble", "Sin disponibilidad para estas fechas")],
    });
    renderRuta(`/web/resultados?${QUERY}`);
    expect(await screen.findByRole("heading", { level: 2, name: "Sin disponibilidad para estas fechas" })).toBeInTheDocument();
    expect(screen.getByText("Probá con otras fechas o con menos huéspedes.")).toBeInTheDocument();
    expect(screen.getByText(/Recepción:/)).toBeInTheDocument();
  });

  it("error de red: 'Reintentar' repite la misma búsqueda", async () => {
    consultarDisponibilidad.mockRejectedValueOnce({ codigo: "ERROR_RED", mensaje: "x", status: 0 });
    renderRuta(`/web/resultados?${QUERY}`);
    fireEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    await screen.findByRole("heading", { name: "Doble", level: 2 });
    expect(consultarDisponibilidad).toHaveBeenCalledTimes(2);
    expect(consultarDisponibilidad.mock.calls[1][0]).toEqual(consultarDisponibilidad.mock.calls[0][0]);
  });

  it("DATOS_INVALIDOS de la API marca el campo del buscador", async () => {
    consultarDisponibilidad.mockRejectedValue({ codigo: "DATOS_INVALIDOS", mensaje: "La estadía no puede superar las 30 noches.", campo: "fechaHasta", status: 400 });
    renderRuta(`/web/resultados?${QUERY}`);
    await waitFor(() => expect(screen.getByLabelText("Salida")).toHaveAttribute("aria-invalid", "true"));
  });

  it("parámetros inválidos en la URL: aviso, buscador y sin consultar la API", async () => {
    renderRuta(`/web/resultados?entrada=${dia(-3)}&salida=${dia(-1)}&adultos=2`);
    expect(await screen.findByText(/la búsqueda del link no es válida/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Entrada")).toHaveAttribute("aria-invalid", "true");
    expect(consultarDisponibilidad).not.toHaveBeenCalled();
  });

  it("sin búsqueda en la URL pero con búsqueda en el contexto: completa la URL (un F5 la repite)", async () => {
    sessionStorage.setItem(
      CLAVE_STORAGE,
      JSON.stringify({ fechaDesde: ENTRADA, fechaHasta: SALIDA, ocupacion: [{ adultos: 2, menores: 0 }], claveIdempotencia: "clave-0001" })
    );
    renderRuta("/web/resultados");
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(`/web/resultados?${QUERY}`));
    await screen.findByRole("heading", { name: "Doble", level: 2 });
  });

  it("Elegir: 'Cotizando…' y sin doble envío; OK → /web/datos con la cotización", async () => {
    let resolver;
    cotizar.mockReturnValue(new Promise((r) => (resolver = r)));
    renderRuta(`/web/resultados?${QUERY}`);
    const boton = await screen.findByRole("button", { name: "Elegir No reembolsable por $ 42.500" });
    fireEvent.click(boton);
    expect(boton).toHaveTextContent("Cotizando…");
    expect(boton).toBeDisabled();
    for (const b of screen.getAllByRole("button", { name: /^Elegir/ })) expect(b).toBeDisabled();
    fireEvent.click(boton);
    expect(cotizar).toHaveBeenCalledTimes(1);
    await act(async () => resolver({ total: 42500, promedioPorNoche: 21250, noches: 2, plan: {}, habitaciones: [] }));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/datos"));
    expect(JSON.parse(sessionStorage.getItem(CLAVE_STORAGE)).cotizacion).toEqual({ total: 42500, promedioPorNoche: 21250, noches: 2 });
  });

  it("SIN_DISPONIBILIDAD: refresca los resultados y avisa que ese tipo se agotó", async () => {
    cotizar.mockRejectedValue({ codigo: "SIN_DISPONIBILIDAD", mensaje: "x", status: 409 });
    renderRuta(`/web/resultados?${QUERY}`);
    fireEvent.click(await screen.findByRole("button", { name: "Elegir Tarifa flexible por $ 50.000" }));
    expect(await screen.findByText(/Ese tipo se agotó para tus fechas/)).toBeInTheDocument();
    await waitFor(() => expect(consultarDisponibilidad).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/web/resultados");
  });

  it("mensaje seguro del motor (estadía mínima): se muestra en la tarjeta del tipo", async () => {
    cotizar.mockRejectedValue({ codigo: "DATOS_INVALIDOS", mensaje: "La estadía mínima para esta reserva es de 3 noches", status: 400 });
    renderRuta(`/web/resultados?${QUERY}`);
    fireEvent.click(await screen.findByRole("button", { name: "Elegir Tarifa flexible por $ 50.000" }));
    const doble = screen.getByRole("article", { name: "Doble" });
    expect(await within(doble).findByText(/La estadía mínima para esta reserva es de 3 noches/)).toBeInTheDocument();
  });
});

describe("Detalle del tipo", () => {
  it("con búsqueda: solo los planes de ESTE tipo con 'Reservar', políticas reales y volver a resultados", async () => {
    renderRuta(`/web/habitacion/2?${QUERY}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Habitación Doble" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Reservar Tarifa flexible por $ 50.000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reservar No reembolsable por $ 42.500" })).toBeInTheDocument();
    expect(screen.queryByText("$ 40.000")).not.toBeInTheDocument(); // precio de la Simple
    const politicas = within(screen.getByRole("heading", { name: "Políticas de la estadía" }).closest("section"));
    expect(politicas.getByText(/se cobra la primera noche/)).toBeInTheDocument();
    expect(politicas.getByText(/se cobra el total de la estadía/)).toBeInTheDocument();
    expect(politicas.getByText(/salida hasta las 10 h/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver a resultados/i })).toHaveAttribute("href", `/web/resultados?${QUERY}`);
    expect(document.title).toBe("Habitación Doble · Holiday Inn Salta");
  });

  it("Reservar usa el mismo flujo que Elegir", async () => {
    cotizar.mockResolvedValue({ total: 50000, promedioPorNoche: 25000, noches: 2, plan: {}, habitaciones: [] });
    renderRuta(`/web/habitacion/2?${QUERY}`);
    fireEvent.click(await screen.findByRole("button", { name: "Reservar Tarifa flexible por $ 50.000" }));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/datos"));
    expect(cotizar).toHaveBeenCalledWith({
      fechaDesde: ENTRADA,
      fechaHasta: SALIDA,
      planTarifarioId: 1,
      habitaciones: [{ tipoHabitacionId: 2, adultos: 2, menores: 0 }],
    });
  });

  it("con búsqueda y el tipo no disponible: su motivo", async () => {
    consultarDisponibilidad.mockResolvedValue({
      ...DISPONIBILIDAD,
      tipos: [noDisponibleTipo(2, "Doble", "Sin disponibilidad para estas fechas")],
    });
    renderRuta(`/web/habitacion/2?${QUERY}`);
    expect(await screen.findByText("Sin disponibilidad para estas fechas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reservar /i })).not.toBeInTheDocument();
  });

  it("sin búsqueda: 'Elegí tus fechas para ver precios' con el buscador compacto", async () => {
    renderRuta("/web/habitacion/1");
    expect(await screen.findByRole("heading", { name: "Elegí tus fechas para ver precios" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /buscar disponibilidad/i })).toBeInTheDocument();
    expect(consultarDisponibilidad).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /volver al inicio/i })).toHaveAttribute("href", "/web");
  });

  it("tipo inexistente: 'No encontramos esa habitación' con link al inicio", async () => {
    renderRuta("/web/habitacion/99");
    expect(await screen.findByRole("heading", { level: 1, name: "No encontramos esa habitación" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ir al inicio/i })).toHaveAttribute("href", "/web");
  });

  it("galería: 'Ver las 5 fotos' abre un diálogo accesible; flechas, Esc y el foco vuelve al botón", async () => {
    renderRuta("/web/habitacion/2");
    const abrir = await screen.findByRole("button", { name: "Ver las 5 fotos" });
    fireEvent.click(abrir);
    const dialogo = screen.getByRole("dialog", { name: "Fotos de la habitación Doble" });
    expect(within(dialogo).getByRole("button", { name: "Cerrar las fotos" })).toHaveFocus();
    expect(within(dialogo).getByText("Foto 1 de 5")).toBeInTheDocument();
    fireEvent.keyDown(dialogo, { key: "ArrowRight" });
    expect(within(dialogo).getByText("Foto 2 de 5")).toBeInTheDocument();
    fireEvent.keyDown(dialogo, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });
});
