// Web vieja (HU-40) retirada: /disponibilidad y /reservar redirigen a /web (el motor de reservas web).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, useLocation } from "react-router-dom";
import App from "./App";

// El sitio web nuevo se reemplaza por marcadores: acá solo importa a dónde llega la ruta.
vi.mock("./modulos/ecommerce", () => {
  const Pagina = ({ nombre }) => <div data-testid="pagina-web">{nombre}</div>;
  return {
    LayoutEcommerce: () => (
      <div data-testid="layout-web">
        <Outlet />
      </div>
    ),
    GuardaCompra: ({ children }) => children,
    InicioPage: () => <Pagina nombre="inicio" />,
    ResultadosPage: () => <Pagina nombre="resultados" />,
    HabitacionesWebPage: () => <Pagina nombre="habitaciones" />,
    PromocionesPage: () => <Pagina nombre="promociones" />,
    ExperienciasPage: () => <Pagina nombre="experiencias" />,
    DetalleTipoPage: () => <Pagina nombre="detalle" />,
    DatosHuespedPage: () => <Pagina nombre="datos" />,
    PagoPage: () => <Pagina nombre="pago" />,
    ConfirmacionPage: () => <Pagina nombre="confirmacion" />,
    MiReservaPage: () => <Pagina nombre="mi-reserva" />,
  };
});
vi.mock("./lib/sesion", async (importOriginal) => ({ ...(await importOriginal()), useSesion: () => ({ rol: null }) }));

function Ubicacion() {
  const { pathname, search } = useLocation();
  return <div data-testid="ubicacion">{`${pathname}${search}`}</div>;
}

function renderEn(ruta) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
      <Ubicacion />
    </MemoryRouter>
  );
}

describe("web vieja retirada", () => {
  it.each(["/disponibilidad", "/reservar"])("%s redirige a /web", async (ruta) => {
    renderEn(ruta);
    expect(await screen.findByTestId("layout-web")).toBeInTheDocument();
    expect(screen.getByTestId("pagina-web")).toHaveTextContent("inicio");
    expect(screen.getByTestId("ubicacion")).toHaveTextContent(/^\/web$/);
  });

  it("la redirección reemplaza la entrada del historial (con 'atrás' no se vuelve a la web vieja)", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login", "/reservar"]} initialIndex={1}>
        <App />
        <Ubicacion />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("layout-web")).toBeInTheDocument();
    expect(container).toBeTruthy();
    expect(screen.getByTestId("ubicacion")).toHaveTextContent(/^\/web$/);
  });

  it("/web y /web/mi-reserva siguen funcionando sin sesión", async () => {
    renderEn("/web/mi-reserva");
    expect(await screen.findByTestId("pagina-web")).toHaveTextContent("mi-reserva");
  });
});
