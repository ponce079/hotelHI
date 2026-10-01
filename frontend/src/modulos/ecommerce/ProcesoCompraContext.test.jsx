import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CLAVE_STORAGE, ProcesoCompraProvider, serializarParaStorage, useProcesoCompra } from "./ProcesoCompraContext";
import { CODIGO_ERROR, MAX_HABITACIONES_WEB } from "./ecommerce.constantes";

const SIMPLE = { tipoHabitacionId: 1, nombre: "Simple", capacidadMaxima: 2 };
const DOBLE = { tipoHabitacionId: 2, nombre: "Doble", capacidadMaxima: 4 };
const BAR = { planTarifarioId: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE", total: 50000, promedioPorNoche: 25000 };
const NRF = { planTarifarioId: 2, codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: null, penalidadNoShow: "TOTAL_ESTADIA", total: 42500, promedioPorNoche: 21250 };
const TARJETA = { titular: "MARIA", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" };

function montar() {
  return renderHook(() => useProcesoCompra(), { wrapper: ProcesoCompraProvider });
}

function busqueda(result, cambios = {}) {
  act(() =>
    result.current.definirBusqueda({
      fechaDesde: "2026-10-16",
      fechaHasta: "2026-10-18",
      ocupacion: [{ adultos: 2, menores: 0 }],
      ...cambios,
    })
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("clave de idempotencia", () => {
  it("se genera al empezar (UUID) y se guarda en sessionStorage", () => {
    const { result } = montar();
    expect(result.current.claveIdempotencia).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(sessionStorage.getItem(CLAVE_STORAGE)).claveIdempotencia).toBe(result.current.claveIdempotencia);
  });

  it("se regenera si cambian las fechas o la ocupación (y se limpia la selección)", () => {
    const { result } = montar();
    busqueda(result);
    act(() => result.current.elegirPlan(DOBLE, BAR));
    const c1 = result.current.claveIdempotencia;

    busqueda(result); // misma búsqueda: no cambia nada
    expect(result.current.claveIdempotencia).toBe(c1);
    expect(result.current.plan).toEqual(BAR);

    busqueda(result, { fechaHasta: "2026-10-19" });
    const c2 = result.current.claveIdempotencia;
    expect(c2).not.toBe(c1);
    expect(result.current.tipo).toBeNull();
    expect(result.current.plan).toBeNull();

    busqueda(result, { fechaHasta: "2026-10-19", ocupacion: [{ adultos: 3, menores: 0 }] });
    expect(result.current.claveIdempotencia).not.toBe(c2);
  });

  it("se regenera si cambia el tipo o el plan, no si se elige lo mismo", () => {
    const { result } = montar();
    busqueda(result);
    act(() => result.current.elegirPlan(SIMPLE, BAR));
    const c1 = result.current.claveIdempotencia;

    act(() => result.current.elegirPlan(SIMPLE, BAR));
    expect(result.current.claveIdempotencia).toBe(c1);

    act(() => result.current.elegirPlan(SIMPLE, NRF));
    const c2 = result.current.claveIdempotencia;
    expect(c2).not.toBe(c1);

    act(() => result.current.elegirPlan(DOBLE, NRF));
    expect(result.current.claveIdempotencia).not.toBe(c2);
  });

  it("se borra al registrar el resultado (llegada a la confirmación)", () => {
    const { result } = montar();
    busqueda(result);
    act(() => result.current.elegirPlan(DOBLE, BAR));
    act(() => result.current.registrarResultado({ codigoConfirmacion: "ABC12345", plan: { reembolsable: true } }));
    expect(result.current.claveIdempotencia).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(CLAVE_STORAGE)).claveIdempotencia).toBeNull();
  });

  it.each([
    CODIGO_ERROR.DATOS_INVALIDOS,
    CODIGO_ERROR.PRECIO_CAMBIADO,
    CODIGO_ERROR.SIN_DISPONIBILIDAD,
    CODIGO_ERROR.PAGO_RECHAZADO,
    CODIGO_ERROR.TARJETA_VENCE_ANTES,
    CODIGO_ERROR.CLAVE_REUTILIZADA,
  ])("después de un error DEFINITIVO (%s) se genera una clave nueva", (codigo) => {
    const { result } = montar();
    busqueda(result);
    act(() => result.current.elegirPlan(DOBLE, BAR));
    const antes = result.current.claveIdempotencia;
    let regenero;
    act(() => {
      regenero = result.current.tratarErrorReserva({ codigo, mensaje: "x" });
    });
    expect(regenero).toBe(true);
    expect(result.current.claveIdempotencia).not.toBe(antes);
    expect(result.current.claveIdempotencia).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([CODIGO_ERROR.ERROR_RED, CODIGO_ERROR.ERROR_INTERNO, CODIGO_ERROR.DEMASIADOS_INTENTOS])(
    "después de un error SIN respuesta definitiva (%s) se mantiene la MISMA clave",
    (codigo) => {
      const { result } = montar();
      busqueda(result);
      act(() => result.current.elegirPlan(DOBLE, BAR));
      const antes = result.current.claveIdempotencia;
      let regenero;
      act(() => {
        regenero = result.current.tratarErrorReserva({ codigo, mensaje: "x" });
      });
      expect(regenero).toBe(false);
      expect(result.current.claveIdempotencia).toBe(antes);
    }
  );
});

describe("persistencia y datos de tarjeta", () => {
  it("sobrevive a un F5 (se relee de sessionStorage)", () => {
    const primero = montar();
    busqueda(primero.result);
    act(() => primero.result.current.elegirPlan(DOBLE, NRF));
    act(() => primero.result.current.actualizarHuesped({ nombre: "María", email: "maria@correo.com" }));
    const clave = primero.result.current.claveIdempotencia;
    primero.unmount();

    const { result } = montar();
    expect(result.current.tipo).toEqual(DOBLE);
    expect(result.current.plan).toEqual(NRF);
    expect(result.current.huesped).toMatchObject({ nombre: "María", email: "maria@correo.com" });
    expect(result.current.claveIdempotencia).toBe(clave);
  });

  it("la tarjeta va en el cuerpo del pedido pero nunca al estado ni a ningún storage", () => {
    const { result } = montar();
    busqueda(result);
    act(() => result.current.elegirPlan(DOBLE, BAR));
    // Aunque alguien intentara colar la tarjeta en el huésped, la lista blanca la descarta.
    act(() => result.current.actualizarHuesped({ nombre: "María", tarjeta: TARJETA, numero: TARJETA.numero, cvv: "123" }));

    const cuerpo = result.current.armarCuerpoReserva({ tarjeta: TARJETA });
    expect(cuerpo.tarjeta).toEqual(TARJETA);
    expect(cuerpo).toMatchObject({ planTarifarioId: 1, totalEsperado: 50000, habitaciones: [{ tipoHabitacionId: 2, adultos: 2, menores: 0 }] });
    expect(cuerpo.consentimiento.versionPoliticas).toBe("2026-10-01");

    const { armarCuerpoReserva: _f, ...estado } = result.current;
    const textoEstado = JSON.stringify(estado);
    const textoStorage = sessionStorage.getItem(CLAVE_STORAGE) + JSON.stringify({ ...localStorage });
    for (const texto of [textoEstado, textoStorage]) {
      expect(texto).not.toContain(TARJETA.numero);
      expect(texto).not.toMatch(/"(cvv|numero|vencimientoMes|vencimientoAnio|tarjeta)"/);
    }
  });

  it("serializarParaStorage descarta cualquier campo fuera de la lista blanca", () => {
    const serializado = serializarParaStorage({
      fechaDesde: "2026-10-16",
      fechaHasta: "2026-10-18",
      ocupacion: [{ adultos: 2, menores: 0, cvv: "1" }],
      tipo: DOBLE,
      plan: { ...BAR, numero: "x" },
      cotizacion: null,
      huesped: { nombre: "A", cvv: "123" },
      llegada: { horaEstimada: "NO_SABE" },
      solicitudesEspeciales: "",
      consentimiento: { aceptaPoliticas: true, aceptaComunicaciones: false },
      resultado: { codigoConfirmacion: "X", garantia: { tipo: "GARANTIA", marca: "VISA", ultimos4: "4242", token: "t" }, tarjeta: TARJETA },
      claveIdempotencia: "k",
      tarjeta: TARJETA,
    });
    expect(JSON.stringify(serializado)).not.toMatch(/cvv|"numero"|tarjeta|token|4242424242424242/);
  });

  it(`acepta hasta ${MAX_HABITACIONES_WEB} habitaciones en la ocupación`, () => {
    const { result } = montar();
    busqueda(result, { ocupacion: Array(5).fill({ adultos: 1, menores: 0 }) });
    expect(result.current.ocupacion).toHaveLength(MAX_HABITACIONES_WEB);
  });
});
