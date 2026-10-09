import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "../../App";
import { CLAVE_STORAGE } from "./ProcesoCompraContext";
import { reiniciarMock } from "./ecommerce.mock";
import { hoyEnHoraLocal } from "../../lib/fechas";

// Fechas relativas a hoy (hora argentina), como el resto de los tests.
function dia(desplazamiento) {
  const [a, m, d] = hoyEnHoraLocal().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + desplazamiento)).toISOString().slice(0, 10);
}
const ENTRADA = dia(12);
const SALIDA = dia(14);

// Las rutas /web viven fuera de RequireSesion: no hace falta sesión de staff.
vi.mock("../../lib/sesion", () => ({ useSesion: () => ({ rol: null }) }));

const DOBLE = { tipoHabitacionId: 2, nombre: "Doble", capacidadMaxima: 4 };
const BAR = { planTarifarioId: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE", total: 50000, promedioPorNoche: 25000 };
// Titular completo y términos aceptados (lo que deja cargado /web/datos).
const HUESPED = {
  nombres: "María José",
  apellido: "González",
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "30111222",
  fechaNacimiento: "1990-05-20",
  email: "maria@correo.com",
  telefono: "+54 9 387 555-1234",
  nacionalidad: "",
  paisResidencia: "",
};
const DATOS_OK = { fechaDesde: ENTRADA, fechaHasta: SALIDA, huesped: HUESPED, consentimiento: { aceptaPoliticas: true, aceptaComunicaciones: false } };
const NRF = { planTarifarioId: 2, codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: null, penalidadNoShow: "TOTAL_ESTADIA", total: 42500, promedioPorNoche: 21250 };

function guardarProceso(estado) {
  sessionStorage.setItem(
    CLAVE_STORAGE,
    JSON.stringify({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", ocupacion: [{ adultos: 2, menores: 0 }], claveIdempotencia: "clave-inicial-0001", ...estado })
  );
}

function Ubicacion() {
  const { pathname } = useLocation();
  return <output data-testid="ruta">{pathname}</output>;
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

beforeEach(() => {
  sessionStorage.clear();
  reiniciarMock();
  vi.stubEnv("VITE_ECOMMERCE_MOCK", "true");
  window.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllEnvs());

describe("las siete rutas /web renderizan", () => {
  it("/web: inicio con buscador y los tipos del mock", async () => {
    renderRuta("/web");
    expect(screen.getByRole("heading", { level: 1, name: /viví salta/i })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /buscar disponibilidad/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Simple" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Doble" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /mi reserva/i })[0]).toHaveAttribute("href", "/web/mi-reserva");
    // Sin precio antes de buscar, sin cuentas ni medios de pago descartados.
    expect(screen.queryByText(/\$ \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ingresar|crear una cuenta|mercado pago|transferencia/i)).not.toBeInTheDocument();
  });

  it("/web/resultados: un tipo por tarjeta con sus planes BAR y NRF y sus condiciones", async () => {
    renderRuta(`/web/resultados?entrada=${ENTRADA}&salida=${SALIDA}&adultos=2&menores=0`);
    expect(screen.getByRole("heading", { level: 1, name: /habitaciones disponibles/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Simple" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Doble" })).toBeInTheDocument();
    expect(screen.getAllByText("Cancelación sin cargo hasta 48 h antes de la llegada")).toHaveLength(2);
    expect(screen.getAllByText("Se cobra el total al reservar · Sin devolución")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Elegir No reembolsable por $ 42.500" })).toBeInTheDocument();
    expect(screen.getByText("Últimas disponibles")).toBeInTheDocument();
    // Nunca número de habitación, piso ni cantidad de libres.
    expect(screen.queryByText(/habitación \d|piso|libres/i)).not.toBeInTheDocument();
  });

  it("/web/resultados: un tipo no disponible se muestra deshabilitado con su motivo", async () => {
    renderRuta(`/web/resultados?entrada=${ENTRADA}&salida=${SALIDA}&adultos=3&menores=0`);
    expect(await screen.findByText("Admite hasta 2 personas")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Simple" })).toHaveAttribute("aria-disabled", "true");
  });

  it("/web/habitacion/:tipoHabitacionId: detalle del tipo", async () => {
    renderRuta("/web/habitacion/2");
    expect(await screen.findByRole("heading", { level: 1, name: "Habitación Doble" })).toBeInTheDocument();
    expect(screen.getByText(/hasta 4 personas/i)).toBeInTheDocument();
  });

  it("/web/datos: formulario del titular con pasos y resumen", () => {
    guardarProceso({ tipo: DOBLE, plan: BAR });
    renderRuta("/web/datos");
    expect(screen.getByRole("heading", { level: 1, name: /completá tus datos/i })).toBeInTheDocument();
    expect(screen.queryByText(/responsable: tomás/i)).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /pasos de la reserva/i })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /resumen de tu reserva/i })).toHaveTextContent("Precio final en pesos argentinos, IVA incluido");
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /continuar/i }).length).toBeGreaterThan(0);
  });

  it("/web/pago: reembolsable → Confirmar reserva", () => {
    guardarProceso({ tipo: DOBLE, plan: BAR, ...DATOS_OK });
    renderRuta("/web/pago");
    expect(screen.getByRole("heading", { level: 1, name: "Pago" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /confirmar reserva/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("Tu tarjeta solo garantiza la reserva: no se cobra nada ahora")).toBeInTheDocument();
  });

  it("/web/pago: no reembolsable → Pagar $ X", () => {
    guardarProceso({ tipo: DOBLE, plan: NRF, ...DATOS_OK });
    renderRuta("/web/pago");
    expect(screen.getAllByRole("button", { name: /pagar \$ 42\.500/i }).length).toBeGreaterThan(0);
  });

  it("/web/pago sin los datos del titular vuelve a /web/datos", async () => {
    guardarProceso({ tipo: DOBLE, plan: BAR });
    renderRuta("/web/pago");
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/datos"));
  });

  it("/web/confirmacion: código de la API y estado según el plan, sin número de habitación", () => {
    guardarProceso({
      tipo: DOBLE,
      plan: BAR,
      claveIdempotencia: null,
      resultado: {
        codigoConfirmacion: "3FA9C21B",
        estado: "Confirmada",
        fechaDesde: "2026-10-16",
        fechaHasta: "2026-10-18",
        noches: 2,
        plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48 },
        total: 50000,
        cobradoAhora: 0,
        garantia: { tipo: "GARANTIA", marca: "VISA", ultimos4: "4242" },
        habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }],
        email: { enviado: true },
      },
    });
    renderRuta("/web/confirmacion");
    expect(screen.getByRole("heading", { level: 1, name: /listo, te esperamos/i })).toBeInTheDocument();
    expect(screen.getByText("3FA9C21B")).toBeInTheDocument();
    expect(screen.getByText("Confirmada · garantizada con tarjeta")).toBeInTheDocument();
    expect(screen.queryByText(/descargar comprobante|agregar al calendario|check-in online/i)).not.toBeInTheDocument();
  });

  it("/web/mi-reserva: consulta con código + email", async () => {
    renderRuta("/web/mi-reserva");
    expect(screen.getByRole("heading", { level: 1, name: /consultá tu reserva/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/código de reserva/i), { target: { value: "3fa9c21b" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "demo@hotel.com" } });
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    expect(await screen.findByRole("heading", { name: "Reserva 3FA9C21B" })).toBeInTheDocument();
  });
});

describe("guardas", () => {
  it.each(["/web/datos", "/web/pago"])("%s sin tipo y plan elegidos redirige a /web", async (ruta) => {
    renderRuta(ruta);
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/web$/));
  });

  it("/web/pago con plan pero sin tipo redirige a /web", async () => {
    guardarProceso({ plan: BAR });
    renderRuta("/web/pago");
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/web$/));
  });

  it("/web/confirmacion sin resultado redirige a /web", async () => {
    guardarProceso({ tipo: DOBLE, plan: BAR });
    renderRuta("/web/confirmacion");
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/web$/));
  });

  it("/web/pago con la reserva ya creada manda a la confirmación (no permite una segunda)", async () => {
    guardarProceso({ tipo: DOBLE, plan: BAR, resultado: { codigoConfirmacion: "X", plan: { reembolsable: true }, habitaciones: [] } });
    renderRuta("/web/pago");
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/confirmacion"));
  });
});

describe("pago con el formulario de tarjeta (mock)", () => {
  it("crea la reserva, borra la clave y llega a la confirmación sin dejar la tarjeta en el storage", async () => {
    guardarProceso({ tipo: DOBLE, plan: BAR, ...DATOS_OK });
    renderRuta("/web/pago");
    fireEvent.change(screen.getByLabelText(/número de tarjeta/i), { target: { value: "4242424242424242" } });
    fireEvent.change(screen.getByLabelText(/nombre como figura/i), { target: { value: "MARIA GONZALEZ" } });
    fireEvent.change(screen.getByLabelText(/vencimiento/i), { target: { value: "1235" } });
    fireEvent.change(screen.getByLabelText(/código de seguridad/i), { target: { value: "123" } });
    const [boton] = screen.getAllByRole("button", { name: /confirmar reserva/i });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);

    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/confirmacion"));
    expect(await screen.findByText("Confirmada · garantizada con tarjeta")).toBeInTheDocument();
    const guardado = sessionStorage.getItem(CLAVE_STORAGE);
    expect(JSON.parse(guardado).claveIdempotencia).toBeNull();
    expect(guardado).not.toMatch(/4242424242424242|"cvv"|"numero"|"tarjeta"/);
  });
});
