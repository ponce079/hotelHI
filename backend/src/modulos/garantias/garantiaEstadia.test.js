// Garantía del check-in: preautorización (tarjeta) o depósito (efectivo).
// Base en memoria + pasarela real espiada.

let mockGarantiaReserva;
let mockCreadas;
let mockFallaAlGuardar;
let mockForzar;

jest.mock("../../lib/prisma", () => ({
  garantiaReserva: { findUnique: async () => (mockGarantiaReserva ? { ...mockGarantiaReserva } : null) },
  garantiaEstadia: {
    create: async ({ data }) => {
      if (mockFallaAlGuardar) throw new Error("fallo de base");
      mockCreadas.push(data);
      return data;
    },
    findUnique: async () => null,
  },
}));

jest.mock("./pasarela.servicio", () => {
  const real = jest.requireActual("./pasarela.servicio");
  return { ...real, procesarTarjeta: jest.fn(async (p) => mockForzar?.(p) ?? real.procesarTarjeta(p)) };
});

const { iniciarGarantiaDeCheckIn, validarEnCheckIn } = require("./garantiaEstadia.servicio");
const { procesarTarjeta } = require("./pasarela.servicio");
const { MONTO_PREAUTORIZACION_CHECKIN } = require("./garantias.constantes");

const SALIDA = new Date("2027-03-12T00:00:00.000Z");
const TARJETA = { titular: "Ana Pérez", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "123" };
const ops = () => procesarTarjeta.mock.calls.map(([p]) => p.operacion);
let TOKEN;

beforeAll(async () => {
  const real = jest.requireActual("./pasarela.servicio");
  TOKEN = (await real.procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA })).token;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockGarantiaReserva = { reservaId: 7, tipo: "TARJETA", token: TOKEN, marca: "Visa", ultimos4: "4242", estado: "Vigente" };
  mockCreadas = [];
  mockFallaAlGuardar = false;
  mockForzar = undefined;
});

const iniciar = (pedido, extra = {}) => iniciarGarantiaDeCheckIn({ pedido, reservaId: 7, fechaHasta: SALIDA, ...extra });

describe("validarEnCheckIn", () => {
  test("hay que confirmar la garantía", () => {
    expect(() => validarEnCheckIn({ garantiaConfirmada: false, medioGarantia: "Efectivo", fechaHasta: SALIDA })).toThrow(/validar la garantía/);
  });
  test("débito: no se preautoriza (el dinero sale de la cuenta)", () => {
    expect(() => validarEnCheckIn({ garantiaConfirmada: true, medioGarantia: "Tarjeta débito", fechaHasta: SALIDA })).toThrow(
      /no se preautoriza/
    );
  });
  test("transferencia y medios desconocidos: no son medios de garantía", () => {
    for (const medio of ["Transferencia", "Online", "Cripto"]) {
      expect(() => validarEnCheckIn({ garantiaConfirmada: true, medioGarantia: medio, fechaHasta: SALIDA })).toThrow(/debe ser uno de/);
    }
  });
  test("efectivo → depósito; crédito → preautorización", () => {
    expect(validarEnCheckIn({ garantiaConfirmada: true, medioGarantia: "Efectivo", fechaHasta: SALIDA }).tipo).toBe("DEPOSITO_EFECTIVO");
    expect(validarEnCheckIn({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito", fechaHasta: SALIDA }).tipo).toBe("PREAUTORIZACION");
  });
  test("tarjeta nueva: mismas validaciones que en la reserva (Luhn, vence antes de la salida)", () => {
    const base = { garantiaConfirmada: true, medioGarantia: "Tarjeta crédito", fechaHasta: SALIDA };
    expect(() => validarEnCheckIn({ ...base, garantiaTarjeta: { ...TARJETA, numero: "4242424242424243" } })).toThrow(/inválido/i);
    expect(() => validarEnCheckIn({ ...base, garantiaTarjeta: { ...TARJETA, vencimientoMes: 2, vencimientoAnio: 2027 } })).toThrow(/vence antes/i);
  });
});

describe("iniciarGarantiaDeCheckIn", () => {
  test("reserva con tarjeta guardada: preautoriza POR TOKEN el monto fijo, sin pedir la tarjeta", async () => {
    const g = await iniciar({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito" });
    expect(ops()).toEqual(["PREAUTORIZACION"]);
    const llamada = procesarTarjeta.mock.calls[0][0];
    expect(llamada).toMatchObject({ monto: MONTO_PREAUTORIZACION_CHECKIN, referenciaPrevia: TOKEN });
    expect(llamada.tarjeta).toBeUndefined();

    await g.registrar(7);
    expect(mockCreadas[0]).toMatchObject({
      reservaId: 7,
      tipo: "PREAUTORIZACION",
      monto: MONTO_PREAUTORIZACION_CHECKIN,
      estado: "Pendiente",
      marca: "Visa",
      ultimos4: "4242",
    });
    expect(mockCreadas[0].referencia).toMatch(/^PRE-\d{6}$/);
    // Ni número ni CVV en lo que se guarda.
    expect(JSON.stringify(mockCreadas)).not.toMatch(/4242424242424242|"cvv"/);
  });

  test("sin tarjeta guardada (walk-in o prepago) y sin tarjeta nueva: se pide una (400)", async () => {
    mockGarantiaReserva = null;
    await expect(iniciar({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito" })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/no dejó una tarjeta en garantía/),
    });
    expect(procesarTarjeta).not.toHaveBeenCalled();
  });

  test("walk-in con tarjeta nueva: la pasarela recibe la tarjeta (se valida y se descarta)", async () => {
    const g = await iniciarGarantiaDeCheckIn({
      pedido: { garantiaConfirmada: true, medioGarantia: "Tarjeta crédito", garantiaTarjeta: TARJETA },
      fechaHasta: SALIDA,
    });
    expect(procesarTarjeta.mock.calls[0][0].tarjeta).toMatchObject({ numero: "4242424242424242" });
    await g.registrar(9);
    expect(mockCreadas[0]).toMatchObject({ reservaId: 9, tipo: "PREAUTORIZACION" });
    expect(JSON.stringify(mockCreadas)).not.toContain("4242424242424242");
  });

  test("tarjeta rechazada: 402 y NO hay garantía (el check-in no debe hacerse)", async () => {
    mockForzar = (p) => (p.operacion === "PREAUTORIZACION" ? { aprobado: false, motivoRechazo: "Fondos insuficientes." } : null);
    await expect(iniciar({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito" })).rejects.toMatchObject({ statusCode: 402 });
    expect(mockCreadas).toHaveLength(0);
  });

  test("depósito en efectivo: no toca la pasarela y queda Pendiente por el monto fijo", async () => {
    const g = await iniciar({ garantiaConfirmada: true, medioGarantia: "Efectivo" });
    expect(procesarTarjeta).not.toHaveBeenCalled();
    await g.registrar(7);
    expect(mockCreadas[0]).toMatchObject({ tipo: "DEPOSITO_EFECTIVO", monto: MONTO_PREAUTORIZACION_CHECKIN, estado: "Pendiente", token: null });
  });

  test("si el check-in falla después de preautorizar, liberar() suelta la retención", async () => {
    const g = await iniciar({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito" });
    await g.liberar();
    expect(ops()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
    expect(procesarTarjeta.mock.calls[1][0].referenciaPrevia).toMatch(/^PRE-\d{6}$/);
  });

  test("liberar() con depósito en efectivo no llama a la pasarela", async () => {
    const g = await iniciar({ garantiaConfirmada: true, medioGarantia: "Efectivo" });
    await g.liberar();
    expect(procesarTarjeta).not.toHaveBeenCalled();
  });

  test("si no se puede guardar la garantía, se libera la retención (no queda plata trabada sin registro)", async () => {
    const g = await iniciar({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito" });
    mockFallaAlGuardar = true;
    await expect(g.registrar(7)).rejects.toThrow("fallo de base");
    expect(ops()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
  });

  test("la clave de idempotencia se respeta (un reintento no preautoriza dos veces)", async () => {
    const a = await iniciar({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito" }, { claveIdempotencia: "ci-1" });
    const b = await iniciar({ garantiaConfirmada: true, medioGarantia: "Tarjeta crédito" }, { claveIdempotencia: "ci-1" });
    await a.registrar(7);
    await b.registrar(7);
    expect(mockCreadas[0].referencia).toBe(mockCreadas[1].referencia);
  });
});
