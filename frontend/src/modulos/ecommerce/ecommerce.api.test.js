import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import {
  cancelarMiReserva,
  consultarDisponibilidad,
  consultarMiReserva,
  cotizar,
  crearReserva,
  normalizarError,
  obtenerTipos,
  usarMock,
} from "./ecommerce.api";
import { pasaLuhn, reiniciarMock } from "./ecommerce.mock";
import { VERSION_POLITICAS } from "./ecommerce.constantes";

vi.mock("../../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const BUSQUEDA = { fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 2, menores: 0 };

function cuerpoReserva(cambios = {}) {
  return {
    claveIdempotencia: "clave-de-prueba-0001",
    fechaDesde: "2026-10-16",
    fechaHasta: "2026-10-18",
    planTarifarioId: 1,
    totalEsperado: 50000,
    habitaciones: [{ tipoHabitacionId: 2, adultos: 2, menores: 0 }],
    huesped: {
      nombre: "María",
      apellido: "González",
      tipoDocumento: "DNI",
      numeroDocumento: "30111222",
      email: "maria@correo.com",
      telefono: "+54 9 387 555-1234",
      nacionalidad: "AR",
      paisResidencia: "AR",
    },
    llegada: { horaEstimada: "NO_SABE" },
    solicitudesEspeciales: "",
    consentimiento: { aceptaPoliticas: true, versionPoliticas: VERSION_POLITICAS, aceptaComunicaciones: false },
    tarjeta: { titular: "MARIA GONZALEZ", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" },
    ...cambios,
  };
}

function conEscenario(escenario) {
  window.history.pushState({}, "", escenario ? `/web/pago?mockEscenario=${escenario}` : "/web/pago");
}

async function fallo(promesa) {
  try {
    await promesa;
  } catch (err) {
    return err;
  }
  throw new Error("Se esperaba un error");
}

// Ninguna respuesta puede traer número de habitación, piso ni cantidad de libres.
function sinDatosDeHabitacion(respuesta) {
  const texto = JSON.stringify(respuesta);
  expect(texto).not.toMatch(/"(numero|numeroHabitacion|habitacionId|piso|libres|cantidadLibres|disponibles)"/);
}

describe("ecommerce.api con VITE_ECOMMERCE_MOCK=true", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ECOMMERCE_MOCK", "true");
    reiniciarMock();
    conEscenario(null);
    api.get.mockReset();
    api.post.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    conEscenario(null);
  });

  it("responde desde el mock sin llamar al backend", async () => {
    expect(usarMock()).toBe(true);
    const { tipos } = await obtenerTipos();
    expect(tipos).toEqual([
      { tipoHabitacionId: 1, nombre: "Simple", capacidadMaxima: 2 },
      { tipoHabitacionId: 2, nombre: "Doble", capacidadMaxima: 4 },
    ]);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("disponibilidad: Simple y Doble con planes BAR y NRF (−15 %) y la forma del contrato", async () => {
    const r = await consultarDisponibilidad(BUSQUEDA);
    expect(r).toMatchObject({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", noches: 2 });
    expect(r.tipos.map((t) => t.nombre)).toEqual(["Simple", "Doble"]);
    for (const tipo of r.tipos) {
      expect(Object.keys(tipo).sort()).toEqual(
        ["capacidadMaxima", "desdePorNoche", "motivoNoDisponible", "nombre", "planes", "tipoHabitacionId", "ultimasDisponibles"].sort()
      );
      expect(typeof tipo.ultimasDisponibles).toBe("boolean");
      expect(tipo.planes.map((p) => p.codigo)).toEqual(["BAR", "NRF"]);
      for (const plan of tipo.planes) {
        expect(Object.keys(plan).sort()).toEqual(
          ["codigo", "horasCancelacionSinCargo", "nombre", "penalidadNoShow", "planTarifarioId", "promedioPorNoche", "reembolsable", "total"].sort()
        );
      }
    }
    const doble = r.tipos.find((t) => t.nombre === "Doble");
    expect(doble.planes[0]).toMatchObject({ reembolsable: true, horasCancelacionSinCargo: 48, total: 50000, promedioPorNoche: 25000 });
    expect(doble.planes[1]).toMatchObject({ reembolsable: false, horasCancelacionSinCargo: null, total: 42500, promedioPorNoche: 21250 });
    expect(doble.desdePorNoche).toBe(21250);
    sinDatosDeHabitacion(r);
  });

  it("disponibilidad: un tipo que no admite la ocupación aparece deshabilitado con su motivo", async () => {
    const r = await consultarDisponibilidad({ ...BUSQUEDA, adultos: 3 });
    const simple = r.tipos.find((t) => t.nombre === "Simple");
    expect(simple).toMatchObject({ planes: [], desdePorNoche: null, motivoNoDisponible: "Admite hasta 2 personas" });
    expect(r.tipos.find((t) => t.nombre === "Doble").planes).toHaveLength(2);
  });

  it("disponibilidad con SIN_DISPONIBILIDAD: Simple aparece sin planes y con el motivo del contrato", async () => {
    conEscenario("SIN_DISPONIBILIDAD");
    const r = await consultarDisponibilidad(BUSQUEDA);
    expect(r.tipos).toHaveLength(2);
    expect(r.tipos.find((t) => t.nombre === "Simple")).toMatchObject({
      planes: [],
      motivoNoDisponible: "Sin disponibilidad para estas fechas",
    });
  });

  it("cotizar suma por noches y acepta hasta 3 habitaciones", async () => {
    const r = await cotizar({
      fechaDesde: "2026-10-16",
      fechaHasta: "2026-10-19",
      planTarifarioId: 2,
      habitaciones: [
        { tipoHabitacionId: 2, adultos: 2, menores: 0 },
        { tipoHabitacionId: 1, adultos: 1, menores: 0 },
        { tipoHabitacionId: 1, adultos: 2, menores: 0 },
      ],
    });
    expect(r.noches).toBe(3);
    expect(r.habitaciones.map((h) => h.subtotal)).toEqual([63750, 51000, 51000]);
    expect(r.total).toBe(165750);
    expect(r.plan.codigo).toBe("NRF");

    const cuatro = await fallo(
      cotizar({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-19", planTarifarioId: 1, habitaciones: Array(4).fill({ tipoHabitacionId: 1, adultos: 1, menores: 0 }) })
    );
    expect(cuatro).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "habitaciones" });
  });

  it("crearReserva: plan reembolsable → GARANTIA sin cobro; respuesta sin número de habitación", async () => {
    const r = await crearReserva(cuerpoReserva());
    expect(r).toMatchObject({
      estado: "Confirmada",
      noches: 2,
      total: 50000,
      cobradoAhora: 0,
      garantia: { tipo: "GARANTIA", marca: "VISA", ultimos4: "4242" },
      habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }],
      email: { enviado: true },
    });
    expect(r.codigoConfirmacion).toMatch(/^[A-Z0-9]{8}$/);
    sinDatosDeHabitacion(r);
    expect(JSON.stringify(r)).not.toMatch(/4242424242424242|"cvv"/);
  });

  it("crearReserva: plan no reembolsable → PREPAGO con cobro del total", async () => {
    const r = await crearReserva(cuerpoReserva({ planTarifarioId: 2, totalEsperado: 42500 }));
    expect(r).toMatchObject({ total: 42500, cobradoAhora: 42500, garantia: { tipo: "PREPAGO" } });
  });

  it("idempotencia: misma clave y mismos datos (otra tarjeta) → misma reserva; datos distintos → CLAVE_REUTILIZADA", async () => {
    const primera = await crearReserva(cuerpoReserva());
    const repetida = await crearReserva(cuerpoReserva({ tarjeta: { ...cuerpoReserva().tarjeta, numero: "5555555555554444" } }));
    expect(repetida.codigoConfirmacion).toBe(primera.codigoConfirmacion);
    expect(repetida.garantia).toBeNull();

    const otra = await fallo(crearReserva(cuerpoReserva({ solicitudesEspeciales: "Cuna" })));
    expect(otra).toMatchObject({ codigo: "CLAVE_REUTILIZADA", status: 409 });
  });

  it("la clave se consume solo cuando la reserva se crea: después de un rechazo, la misma clave sirve", async () => {
    const rechazo = await fallo(crearReserva(cuerpoReserva({ tarjeta: { ...cuerpoReserva().tarjeta, numero: "4000000000000002" } })));
    expect(rechazo.codigo).toBe("PAGO_RECHAZADO");
    await expect(crearReserva(cuerpoReserva())).resolves.toMatchObject({ estado: "Confirmada" });
  });

  describe("tarjetas de prueba", () => {
    it("los números de prueba pasan Luhn", () => {
      expect(pasaLuhn("4242424242424242")).toBe(true);
      expect(pasaLuhn("4000000000000002")).toBe(true);
      expect(pasaLuhn("4000000000000069")).toBe(true);
      expect(pasaLuhn("4242424242424241")).toBe(false);
    });

    it("terminada en 0002 → PAGO_RECHAZADO (fondos insuficientes)", async () => {
      const err = await fallo(crearReserva(cuerpoReserva({ tarjeta: { ...cuerpoReserva().tarjeta, numero: "4000000000000002" } })));
      expect(err).toMatchObject({ codigo: "PAGO_RECHAZADO", status: 402, motivo: "Fondos insuficientes" });
    });

    it("terminada en 0069 → PAGO_RECHAZADO (tarjeta vencida)", async () => {
      const err = await fallo(crearReserva(cuerpoReserva({ tarjeta: { ...cuerpoReserva().tarjeta, numero: "4000000000000069" } })));
      expect(err).toMatchObject({ codigo: "PAGO_RECHAZADO", status: 402, motivo: "Tarjeta vencida" });
    });

    it("número sin Luhn → DATOS_INVALIDOS en tarjeta.numero", async () => {
      const err = await fallo(crearReserva(cuerpoReserva({ tarjeta: { ...cuerpoReserva().tarjeta, numero: "4242424242424241" } })));
      expect(err).toMatchObject({ codigo: "DATOS_INVALIDOS", status: 400, campo: "tarjeta.numero" });
    });

    it("vencimiento anterior a la salida → TARJETA_VENCE_ANTES", async () => {
      const err = await fallo(crearReserva(cuerpoReserva({ tarjeta: { ...cuerpoReserva().tarjeta, vencimientoMes: 9, vencimientoAnio: 2026 } })));
      expect(err).toMatchObject({ codigo: "TARJETA_VENCE_ANTES", status: 422 });
    });
  });

  describe("escenarios ?mockEscenario=", () => {
    it("PRECIO_CAMBIADO → 409 con totalNuevo; reintentando con ese total, la reserva se crea", async () => {
      conEscenario("PRECIO_CAMBIADO");
      const err = await fallo(crearReserva(cuerpoReserva()));
      expect(err).toMatchObject({ codigo: "PRECIO_CAMBIADO", status: 409, totalNuevo: 55000 });
      const r = await crearReserva(cuerpoReserva({ claveIdempotencia: "clave-de-prueba-0002", totalEsperado: err.totalNuevo }));
      expect(r.total).toBe(55000);
    });

    it("SIN_DISPONIBILIDAD → 409", async () => {
      conEscenario("SIN_DISPONIBILIDAD");
      expect(await fallo(crearReserva(cuerpoReserva()))).toMatchObject({ codigo: "SIN_DISPONIBILIDAD", status: 409 });
    });

    it("CLAVE_REUTILIZADA → 409 con la primera clave; con una clave nueva funciona", async () => {
      conEscenario("CLAVE_REUTILIZADA");
      expect(await fallo(crearReserva(cuerpoReserva()))).toMatchObject({ codigo: "CLAVE_REUTILIZADA", status: 409 });
      await expect(crearReserva(cuerpoReserva({ claveIdempotencia: "clave-de-prueba-0003" }))).resolves.toMatchObject({ estado: "Confirmada" });
    });

    it("ERROR_INTERNO → 500 y DEMASIADOS_INTENTOS → 429 en cualquier llamada", async () => {
      conEscenario("ERROR_INTERNO");
      expect(await fallo(obtenerTipos())).toMatchObject({ codigo: "ERROR_INTERNO", status: 500 });
      expect(await fallo(crearReserva(cuerpoReserva()))).toMatchObject({ codigo: "ERROR_INTERNO", status: 500 });
      conEscenario("DEMASIADOS_INTENTOS");
      expect(await fallo(consultarDisponibilidad(BUSQUEDA))).toMatchObject({ codigo: "DEMASIADOS_INTENTOS", status: 429 });
    });
  });

  describe("mi reserva", () => {
    it("DEMO1234 + demo@hotel.com devuelve la reserva de ejemplo cancelable con penalidad", async () => {
      const r = await consultarMiReserva({ codigo: "demo1234", email: "Demo@Hotel.com" });
      expect(r).toMatchObject({ codigoConfirmacion: "DEMO1234", puedeCancelar: true, titular: "Juan P.", documento: "****222" });
      expect(r.penalidadCancelacion).toMatchObject({ aplica: true, monto: 25000 });
      sinDatosDeHabitacion(r);
    });

    it("cualquier otra combinación → NO_ENCONTRADA con el mismo mensaje", async () => {
      const a = await fallo(consultarMiReserva({ codigo: "DEMO1234", email: "otro@hotel.com" }));
      const b = await fallo(consultarMiReserva({ codigo: "NOEXISTE", email: "demo@hotel.com" }));
      expect(a).toMatchObject({ codigo: "NO_ENCONTRADA", status: 404 });
      expect(b.mensaje).toBe(a.mensaje);
    });

    it("cancelar con un monto distinto → PENALIDAD_CAMBIO; con el monto correcto → Cancelada", async () => {
      const err = await fallo(cancelarMiReserva({ codigo: "DEMO1234", email: "demo@hotel.com", montoPenalidadAceptado: 0 }));
      expect(err).toMatchObject({ codigo: "PENALIDAD_CAMBIO", status: 409, montoNuevo: 25000 });
      await expect(cancelarMiReserva({ codigo: "DEMO1234", email: "demo@hotel.com", montoPenalidadAceptado: 25000 })).resolves.toEqual({
        estado: "Cancelada",
        penalidadCobrada: 25000,
      });
    });
  });
});

describe("ecommerce.api sin mock (backend real)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ECOMMERCE_MOCK", "false");
    api.get.mockReset();
    api.post.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("llama a /api/web con el cliente compartido", async () => {
    api.get.mockResolvedValue({ data: { tipos: [] } });
    api.post.mockResolvedValue({ data: { codigoConfirmacion: "X" } });

    await obtenerTipos();
    expect(api.get).toHaveBeenCalledWith("/web/tipos");
    await consultarDisponibilidad(BUSQUEDA);
    expect(api.get).toHaveBeenCalledWith("/web/disponibilidad", { params: BUSQUEDA });
    await crearReserva({ a: 1 });
    expect(api.post).toHaveBeenCalledWith("/web/reservas", { a: 1 }, expect.objectContaining({ timeout: expect.any(Number) }));
    await consultarMiReserva({ codigo: "C", email: "e@x.com" });
    expect(api.post).toHaveBeenCalledWith("/web/mi-reserva", { codigo: "C", email: "e@x.com" });
    await cancelarMiReserva({ codigo: "C", email: "e@x.com", montoPenalidadAceptado: 0 });
    expect(api.post).toHaveBeenCalledWith("/web/mi-reserva/cancelar", { codigo: "C", email: "e@x.com", montoPenalidadAceptado: 0 });
  });

  it("normaliza los errores del backend a { codigo, mensaje, status, ...extra }", async () => {
    api.post.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { error: "Cambió", codigo: "PRECIO_CAMBIADO", totalNuevo: 52000 } } });
    expect(await fallo(crearReserva({}))).toEqual({ codigo: "PRECIO_CAMBIADO", mensaje: "Cambió", status: 409, totalNuevo: 52000 });
  });

  it("sin respuesta (red o timeout) → ERROR_RED; respuesta sin código del contrato → no definitiva", () => {
    expect(normalizarError({ isAxiosError: true, code: "ECONNABORTED" })).toMatchObject({ codigo: "ERROR_RED" });
    expect(normalizarError({ isAxiosError: true, response: { status: 502, data: "Bad Gateway" } })).toMatchObject({ codigo: "ERROR_INTERNO", status: 502 });
    expect(normalizarError({ isAxiosError: true, response: { status: 429, data: {} } })).toMatchObject({ codigo: "DEMASIADOS_INTENTOS" });
  });
});
