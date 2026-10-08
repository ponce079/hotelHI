// Desglose por noche del resumen "Tu reserva" (HU-101): visible en Datos y Pago, colapsado con más de 4
// noches, ausente si la cotización no lo trae y desaparece tras un PRECIO_CAMBIADO. Fechas relativas a hoy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../../App";
import { act } from "@testing-library/react";
import { CLAVE_STORAGE, ProcesoCompraProvider, useProcesoCompra } from "./ProcesoCompraContext";
import { reiniciarMock, mockCotizar } from "./ecommerce.mock";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { formatearFecha, formatearPrecio } from "./formato";

vi.mock("../../lib/sesion", () => ({ useSesion: () => ({ rol: null }) }));

function dia(desplazamiento) {
  const [a, m, d] = hoyEnHoraLocal().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + desplazamiento)).toISOString().slice(0, 10);
}
const DOBLE = { tipoHabitacionId: 2, nombre: "Doble", capacidadMaxima: 3 };
const BAR = { planTarifarioId: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE", total: 0, promedioPorNoche: 0 };
const HUESPED = { nombres: "María José", apellido: "González", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30111222", fechaNacimiento: "1990-05-20", email: "maria@correo.com", telefono: "+54 9 387 555-1234", nacionalidad: "", paisResidencia: "" };

// Noches con un cambio de precio a mitad de la estadía (jueves a lunes, viernes y sábado más caros).
function desgloseDe(cantidad, desde = 20) {
  return Array.from({ length: cantidad }, (_, i) => ({ fecha: dia(desde + i), precio: i % 3 === 1 ? 44000 : 40000 }));
}

function guardar({ noches = 2, desglose, total } = {}) {
  const lista = desglose === undefined ? desgloseDe(noches) : desglose;
  const suma = total ?? (lista ?? desgloseDe(noches)).reduce((s, n) => s + n.precio, 0);
  sessionStorage.setItem(
    CLAVE_STORAGE,
    JSON.stringify({
      fechaDesde: dia(20),
      fechaHasta: dia(20 + noches),
      ocupacion: [{ adultos: 2, menores: 0 }],
      claveIdempotencia: "clave-inicial-0001",
      tipo: DOBLE,
      plan: { ...BAR, total: suma },
      cotizacion: { total: suma, promedioPorNoche: suma / noches, noches, ...(lista ? { desglose: lista } : {}) },
      huesped: HUESPED,
      consentimiento: { aceptaPoliticas: true, aceptaComunicaciones: false },
    })
  );
}

function renderRuta(ruta) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[ruta]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const resumen = () => screen.getByRole("complementary", { name: /resumen de tu reserva/i });
const lista = () => within(resumen()).queryByRole("list", { name: /precio de cada noche/i });
const filaNoche = (n) => `${formatearFecha(n.fecha, { conAnio: false })} · ${formatearPrecio(n.precio)}`;

beforeEach(() => {
  sessionStorage.clear();
  reiniciarMock();
  vi.stubEnv("VITE_ECOMMERCE_MOCK", "true");
  window.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllEnvs());

describe("desglose por noche en el resumen", () => {
  it("se ve en Datos y en Pago: una fila por noche, 'Vie 13 nov · $ 40.000'", () => {
    const desglose = desgloseDe(2);
    for (const ruta of ["/web/datos", "/web/pago"]) {
      sessionStorage.clear();
      guardar({ noches: 2, desglose });
      const { unmount } = renderRuta(ruta);
      const filas = within(lista()).getAllByRole("listitem");
      expect(filas.map((f) => f.textContent)).toEqual(desglose.map(filaNoche));
      expect(filas[0].textContent).toMatch(/^[A-Z][a-zñáéíóú]{2} \d{1,2} [a-z]{3} · \$ 40\.000$/);
      unmount();
    }
  });

  it("con hasta 4 noches se ven todas y no hay botón", () => {
    guardar({ noches: 4 });
    renderRuta("/web/datos");
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(4);
    expect(within(resumen()).queryByRole("button", { name: /ver las/i })).not.toBeInTheDocument();
  });

  it("con más de 4 noches muestra 3 y 'Ver las N noches' despliega el resto (aria-expanded)", () => {
    const desglose = desgloseDe(5);
    guardar({ noches: 5, desglose });
    renderRuta("/web/pago");
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(3);
    const boton = within(resumen()).getByRole("button", { name: "Ver las 5 noches" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(boton);
    const abierto = within(resumen()).getByRole("button", { name: /ver menos/i });
    expect(abierto).toHaveAttribute("aria-expanded", "true");
    expect(within(lista()).getAllByRole("listitem").map((f) => f.textContent)).toEqual(desglose.map(filaNoche));
    fireEvent.click(abierto);
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(3);
  });

  it("si la cotización no trae noches, no muestra nada (compatibilidad)", () => {
    guardar({ noches: 2, desglose: null });
    renderRuta("/web/datos");
    expect(lista()).not.toBeInTheDocument();
    expect(within(resumen()).getByText("Total")).toBeInTheDocument();
  });

  it("la cotización del mock trae noches y su suma es el subtotal", () => {
    return mockCotizar({ fechaDesde: dia(20), fechaHasta: dia(25), planTarifarioId: 1, habitaciones: [{ tipoHabitacionId: 2, adultos: 2, menores: 0 }] }).then((r) => {
      const [linea] = r.habitaciones;
      expect(linea.noches).toHaveLength(5);
      expect(linea.noches.map((n) => n.fecha)).toEqual([20, 21, 22, 23, 24].map(dia));
      expect(Math.round(linea.noches.reduce((s, n) => s + n.precio, 0) * 100) / 100).toBe(linea.subtotal);
    });
  });

  it("tras un PRECIO_CAMBIADO (cotización con el total nuevo y sin noches) el desglose desaparece; al storage solo van fecha y precio", () => {
    let proceso;
    function Sonda() {
      proceso = useProcesoCompra();
      return null;
    }
    render(
      <ProcesoCompraProvider>
        <Sonda />
      </ProcesoCompraProvider>
    );
    const respuesta = { total: 84000, promedioPorNoche: 42000, noches: 2, plan: {}, habitaciones: [{ tipo: "Doble", subtotal: 84000, noches: [{ fecha: dia(20), precio: 40000, extra: "x" }, { fecha: dia(21), precio: 44000 }] }] };
    act(() => proceso.actualizarCotizacion(respuesta));
    expect(proceso.cotizacion.desglose).toEqual([{ fecha: dia(20), precio: 40000 }, { fecha: dia(21), precio: 44000 }]);
    expect(sessionStorage.getItem(CLAVE_STORAGE)).not.toContain("extra");
    // Lo que hace PagoPage con totalNuevo: la cotización se reemplaza sin noches.
    act(() => proceso.actualizarCotizacion({ total: 92400, promedioPorNoche: null, noches: null }));
    expect(proceso.cotizacion).toEqual({ total: 92400, promedioPorNoche: null, noches: null });
    expect(JSON.parse(sessionStorage.getItem(CLAVE_STORAGE)).cotizacion.desglose).toBeUndefined();
  });
});
