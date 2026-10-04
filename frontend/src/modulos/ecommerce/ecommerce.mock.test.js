// Etapa 1B-1: mock alineado con la ficha Huesped de master y mock solo en
// desarrollo (CONTRATO.md).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultarDisponibilidad, consultarMiReserva, crearReserva, usarMock } from "./ecommerce.api";
import { reiniciarMock } from "./ecommerce.mock";
import { VERSION_POLITICAS } from "./ecommerce.constantes";

vi.mock("../../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const HUESPED = {
  nombres: "María José",
  apellido: "González",
  tipoDocumento: "Pasaporte",
  paisDocumento: "CL",
  numeroDocumento: "P1234567",
  fechaNacimiento: "1990-05-20",
  email: "maria@correo.com",
  telefono: "+56 9 5555 1234",
  nacionalidad: "CL",
  paisResidencia: "CL",
};

function cuerpoReserva({ huesped = {}, ...cambios } = {}) {
  return {
    claveIdempotencia: `clave-${Math.random().toString(16).slice(2)}`,
    fechaDesde: "2026-10-16",
    fechaHasta: "2026-10-18",
    planTarifarioId: 1,
    totalEsperado: 50000,
    habitaciones: [{ tipoHabitacionId: 2, adultos: 2, menores: 0 }],
    huesped: { ...HUESPED, ...huesped },
    llegada: { horaEstimada: "NO_SABE" },
    solicitudesEspeciales: "",
    consentimiento: { aceptaPoliticas: true, versionPoliticas: VERSION_POLITICAS, aceptaComunicaciones: false },
    tarjeta: { titular: "MARIA GONZALEZ", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" },
    ...cambios,
  };
}

async function fallo(promesa) {
  try {
    await promesa;
  } catch (err) {
    return err;
  }
  throw new Error("Se esperaba un error");
}

describe("usarMock", () => {
  it("un build de producción (DEV en false) nunca usa el mock, aunque la variable esté en true", () => {
    expect(usarMock({ DEV: false, VITE_ECOMMERCE_MOCK: "true" })).toBe(false);
  });

  it("en desarrollo, solo con VITE_ECOMMERCE_MOCK=true", () => {
    expect(usarMock({ DEV: true, VITE_ECOMMERCE_MOCK: "true" })).toBe(true);
    expect(usarMock({ DEV: true, VITE_ECOMMERCE_MOCK: "false" })).toBe(false);
    expect(usarMock({ DEV: true })).toBe(false);
  });
});

describe("mock alineado con la ficha Huesped", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ECOMMERCE_MOCK", "true");
    reiniciarMock();
    window.history.pushState({}, "", "/web/pago");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, "", "/web/pago");
  });

  it("crea la reserva con el titular nuevo y devuelve un código de 8 hexadecimales", async () => {
    const r = await crearReserva(cuerpoReserva());
    expect(r.codigoConfirmacion).toMatch(/^[0-9A-F]{8}$/);
  });

  it.each([
    ["nombres", { nombres: "" }],
    ["paisDocumento", { paisDocumento: "" }],
    ["fechaNacimiento", { fechaNacimiento: "" }],
    ["tipoDocumento", { tipoDocumento: "Carnet" }],
    ["paisDocumento", { paisDocumento: "XX" }],
    ["nacionalidad", { nacionalidad: "Argentina" }],
    ["paisResidencia", { paisResidencia: "ZZ" }],
    ["email", { email: "sin-arroba" }],
  ])("titular inválido → DATOS_INVALIDOS en huesped.%s", async (campo, huesped) => {
    const err = await fallo(crearReserva(cuerpoReserva({ huesped })));
    expect(err).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: `huesped.${campo}` });
  });

  it("el titular tiene que ser mayor de edad a la fecha de ingreso", async () => {
    // Cumple 18 el 17 de octubre: el 16 (ingreso) todavía tiene 17.
    const menor = await fallo(crearReserva(cuerpoReserva({ huesped: { fechaNacimiento: "2008-10-17" } })));
    expect(menor).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "huesped.fechaNacimiento" });
    await expect(crearReserva(cuerpoReserva({ huesped: { fechaNacimiento: "2008-10-16" } }))).resolves.toHaveProperty(
      "codigoConfirmacion"
    );
  });

  it("disponibilidad: la capacidad manda sobre 'sin disponibilidad' (misma prioridad que el backend)", async () => {
    window.history.pushState({}, "", "/web/resultados?mockEscenario=SIN_DISPONIBILIDAD");
    const r = await consultarDisponibilidad({ fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", adultos: 3, menores: 0 });
    expect(r.tipos.find((t) => t.nombre === "Simple").motivoNoDisponible).toBe("Admite hasta 2 personas");
  });

  describe("Mi reserva (decisión 6)", () => {
    it("reserva web: el email se compara con el de DatosReservaWeb", async () => {
      await expect(consultarMiReserva({ codigo: "3FA9C21B", email: "demo@hotel.com" })).resolves.toMatchObject({
        codigoConfirmacion: "3FA9C21B",
      });
    });

    it("reserva del mostrador con un email como contacto: se encuentra con ese email", async () => {
      await expect(consultarMiReserva({ codigo: "b81d90e4", email: "Mostrador@Hotel.com" })).resolves.toMatchObject({
        codigoConfirmacion: "B81D90E4",
      });
    });

    it("reserva del mostrador con teléfono como único contacto: NO_ENCONTRADA con el mensaje de siempre", async () => {
      const conTelefono = await fallo(consultarMiReserva({ codigo: "7C04E5A2", email: "+54 9 387 555-0101" }));
      const inexistente = await fallo(consultarMiReserva({ codigo: "00000000", email: "demo@hotel.com" }));
      expect(conTelefono).toMatchObject({ codigo: "NO_ENCONTRADA", status: 404 });
      expect(conTelefono.mensaje).toBe(inexistente.mensaje);
    });
  });
});
