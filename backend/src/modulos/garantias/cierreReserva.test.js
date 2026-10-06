// Cancelación y no-show con cobro de la penalidad. Base en memoria + pasarela
// real espiada: lo que se prueba es el reparto del dinero y el ORDEN de las
// operaciones, no la matemática de tarifas (calcularPenalidad se simula).

let mockTablas;
let mockPenalidad;
let mockForzarCobro;

function resetear({ reserva = {}, pagos = [], garantia } = {}) {
  mockTablas = {
    reserva: { id: 7, estado: "Confirmada", motivoCancelacion: null, ...reserva },
    pagoEstadia: pagos.map((p, i) => ({ id: i + 1, reservaId: 7, anulado: false, ...p })),
    garantia: garantia ? { reservaId: 7, ...garantia } : null,
    eventos: [],
  };
}

jest.mock("../../lib/prisma", () => {
  const api = {
    pagoEstadia: {
      findMany: async () => mockTablas.pagoEstadia.filter((p) => !p.anulado),
      create: async ({ data }) => {
        const fila = {
          id: mockTablas.pagoEstadia.length + 1,
          anulado: false,
          ...data,
          medios: data.medios.create.map((m) => ({ ...m })),
        };
        mockTablas.pagoEstadia.push(fila);
        mockTablas.eventos.push(`pago:${data.concepto}`);
        return fila;
      },
    },
    garantiaReserva: {
      findUnique: async () => (mockTablas.garantia ? { ...mockTablas.garantia } : null),
      update: async ({ data }) => {
        Object.assign(mockTablas.garantia, data);
        mockTablas.eventos.push(`garantia:${data.estado}`);
        return mockTablas.garantia;
      },
    },
    reserva: {
      updateMany: async ({ where, data }) => {
        if (mockTablas.reserva.estado !== where.estado) return { count: 0 };
        Object.assign(mockTablas.reserva, data);
        mockTablas.eventos.push(`reserva:${data.estado}`);
        return { count: 1 };
      },
    },
    $transaction: async (fn) => fn(api),
  };
  return api;
});

jest.mock("../tarifas/penalidades.servicio", () => {
  class ErrorDeNegocio extends Error {
    constructor(m, statusCode = 400) {
      super(m);
      this.statusCode = statusCode;
    }
  }
  return { ErrorDeNegocio, calcularPenalidad: jest.fn(async () => mockPenalidad) };
});

jest.mock("./pasarela.servicio", () => {
  const real = jest.requireActual("./pasarela.servicio");
  return { ...real, procesarTarjeta: jest.fn(async (p) => mockForzarCobro?.(p) ?? real.procesarTarjeta(p)) };
});

const { cerrarReservaConPenalidad, liquidarPenalidad } = require("./cierreReserva.servicio");
const { procesarTarjeta } = require("./pasarela.servicio");
const { calcularPenalidad } = require("../tarifas/penalidades.servicio");

const SIN_CARGO = { aplica: false, monto: 0, regla: "SIN_CARGO" };
const PRIMERA_NOCHE = (monto) => ({ aplica: true, monto, regla: "PRIMERA_NOCHE" });
const TOTAL = (monto) => ({ aplica: true, monto, regla: "TOTAL_NO_REEMBOLSABLE" });
let TOKEN;

const pago = (concepto, importe, medioPago = "Transferencia") => ({
  concepto,
  estado: "Pagado",
  medios: [{ medioPago, importe, referencia: null }],
});
const garantiaTarjeta = (estado = "Vigente") => ({
  tipo: "TARJETA",
  token: TOKEN,
  marca: "Visa",
  ultimos4: "4242",
  vencimiento: "12/30",
  monto: 0,
  estado,
});
const cancelar = (extra = {}) =>
  cerrarReservaConPenalidad({ reservaId: 7, tipo: "CANCELACION", estadoDestino: "Cancelada", motivo: "Cambio de planes", ...extra });
const operaciones = () => procesarTarjeta.mock.calls.map(([p]) => p.operacion);

beforeAll(async () => {
  const real = jest.requireActual("./pasarela.servicio");
  TOKEN = (
    await real.procesarTarjeta({
      operacion: "GARANTIA",
      monto: 0,
      tarjeta: { titular: "Ana", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" },
    })
  ).token;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockForzarCobro = undefined;
  mockPenalidad = SIN_CARGO;
  resetear({ garantia: garantiaTarjeta() });
});

describe("liquidarPenalidad (reparto del dinero, en centavos)", () => {
  const liq = (monto, pagado, tieneTarjeta = true) =>
    liquidarPenalidad({ penalidad: { aplica: monto > 0, monto }, pagado, tieneTarjeta });

  test("sin penalidad: se devuelve todo lo pagado", () => {
    expect(liq(0, 40000)).toMatchObject({ retenido: 0, devolver: 40000, aCobrarATarjeta: 0, sinCobrar: 0 });
  });
  test("penalidad cubierta con lo pagado: se retiene la penalidad y se devuelve el resto", () => {
    expect(liq(60000, 100000)).toMatchObject({ retenido: 60000, devolver: 40000, aCobrarATarjeta: 0 });
  });
  test("NRF ya pagado: se retiene todo, no se devuelve ni se cobra nada más", () => {
    expect(liq(150000, 150000)).toMatchObject({ retenido: 150000, devolver: 0, aCobrarATarjeta: 0, sinCobrar: 0 });
  });
  test("lo pagado no alcanza: el resto va a la tarjeta (o queda sin cobrar si no hay)", () => {
    expect(liq(60000, 30000)).toMatchObject({ retenido: 30000, devolver: 0, aCobrarATarjeta: 30000, sinCobrar: 0 });
    expect(liq(60000, 30000, false)).toMatchObject({ aCobrarATarjeta: 0, sinCobrar: 30000 });
  });
  test("no arrastra errores de coma flotante", () => {
    expect(liq(0.3, 0.1)).toMatchObject({ retenido: 0.1, aCobrarATarjeta: 0.2 });
  });
});

describe("cerrarReservaConPenalidad — cancelación", () => {
  test("BAR dentro del plazo: cancela sin cargo, no toca la pasarela y libera la garantía", async () => {
    const r = await cancelar();
    expect(mockTablas.reserva).toMatchObject({ estado: "Cancelada", motivoCancelacion: "Cambio de planes" });
    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(mockTablas.garantia.estado).toBe("Liberada");
    expect(mockTablas.pagoEstadia).toHaveLength(0);
    expect(r).toMatchObject({ estadoCobro: "SIN_CARGO", monto: 0, devuelto: 0, mensaje: "Sin cargo." });
  });

  test("BAR fuera de plazo: cobra la primera noche a la tarjeta guardada (por token) y registra el cargo", async () => {
    mockPenalidad = PRIMERA_NOCHE(50000);
    const r = await cancelar();

    expect(operaciones()).toEqual(["COBRO"]);
    const llamada = procesarTarjeta.mock.calls[0][0];
    expect(llamada).toMatchObject({ monto: 50000, referenciaPrevia: TOKEN });
    expect(llamada.tarjeta).toBeUndefined(); // jamás hay número de tarjeta acá
    expect(mockTablas.reserva.estado).toBe("Cancelada");
    const cargo = mockTablas.pagoEstadia.find((p) => p.concepto === "Penalidad por cancelación");
    expect(cargo.estado).toBe("Pagado");
    expect(cargo.medios[0]).toMatchObject({ medioPago: "Tarjeta crédito", importe: 50000 });
    expect(cargo.medios[0].referencia).toMatch(/^Visa \*\*\*\*4242 · aut\. COB-\d{6}$/);
    expect(mockTablas.garantia.estado).toBe("Capturada");
    expect(r).toMatchObject({ estadoCobro: "COBRADO", cobradoATarjeta: 50000, pendienteDeCobro: 0 });
  });

  test("orden: primero se cancela, después se cobra, y recién ahí se registra el cargo", async () => {
    mockPenalidad = PRIMERA_NOCHE(50000);
    await cancelar();
    expect(mockTablas.eventos).toEqual([
      "reserva:Cancelada",
      "garantia:Cobro pendiente",
      "pago:Penalidad por cancelación",
      "garantia:Capturada",
    ]);
  });

  test("NRF ya pagado con tarjeta: no se cobra nada más y tampoco se devuelve", async () => {
    resetear({
      pagos: [pago("Pago anticipado", 150000, "Tarjeta crédito")],
      garantia: garantiaTarjeta("Capturada"),
    });
    mockPenalidad = TOTAL(150000);
    const r = await cancelar();

    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(mockTablas.pagoEstadia).toHaveLength(1); // ni cargo ni devolución
    expect(mockTablas.garantia.estado).toBe("Capturada");
    expect(r).toMatchObject({ estadoCobro: "RETENIDO", retenido: 150000, devuelto: 0, cobradoATarjeta: 0 });
  });

  test("prepago parcial: la penalidad se descuenta de lo pagado y se devuelve el resto", async () => {
    resetear({
      pagos: [pago("Pago anticipado", 100000)],
      garantia: { tipo: "PREPAGO", monto: 100000, estado: "Capturada" },
    });
    mockPenalidad = PRIMERA_NOCHE(60000);
    const r = await cancelar();

    expect(procesarTarjeta).not.toHaveBeenCalled();
    const devolucion = mockTablas.pagoEstadia.find((p) => p.concepto === "Devolución");
    expect(devolucion.medios[0]).toMatchObject({ medioPago: "Transferencia", importe: -40000 });
    expect(r).toMatchObject({ retenido: 60000, devuelto: 40000, estadoCobro: "RETENIDO" });
  });

  test("el total pagado de la reserva cancelada queda igual a lo que el hotel se quedó (pagado − devuelto)", async () => {
    resetear({ pagos: [pago("Pago anticipado", 100000)], garantia: { tipo: "PREPAGO", monto: 100000, estado: "Capturada" } });
    mockPenalidad = PRIMERA_NOCHE(60000);
    await cancelar();
    // Misma suma que hace consolidarCargos: todos los medios no anulados.
    const neto = mockTablas.pagoEstadia.flatMap((p) => p.medios).reduce((acc, m) => acc + Number(m.importe), 0);
    expect(neto).toBe(60000);
  });

  test("cancelación sin cargo con prepago: se devuelve todo lo pagado", async () => {
    resetear({ pagos: [pago("Pago anticipado", 30000)], garantia: { tipo: "PREPAGO", monto: 30000, estado: "Capturada" } });
    const r = await cancelar();
    expect(mockTablas.pagoEstadia.find((p) => p.concepto === "Devolución").medios[0].importe).toBe(-30000);
    expect(r).toMatchObject({ devuelto: 30000, retenido: 0 });
  });

  test("lo prepagado no alcanza: se retiene y el resto se cobra a la tarjeta", async () => {
    resetear({ pagos: [pago("Pago anticipado", 30000)], garantia: garantiaTarjeta() });
    mockPenalidad = PRIMERA_NOCHE(60000);
    const r = await cancelar();
    expect(procesarTarjeta.mock.calls[0][0].monto).toBe(30000);
    expect(r).toMatchObject({ retenido: 30000, cobradoATarjeta: 30000, estadoCobro: "COBRADO" });
  });

  test("la tarjeta rechaza el cobro: la reserva IGUAL queda cancelada y la deuda queda marcada", async () => {
    mockPenalidad = PRIMERA_NOCHE(50000);
    mockForzarCobro = (p) => (p.operacion === "COBRO" ? { aprobado: false, motivoRechazo: "Fondos insuficientes." } : null);
    const r = await cancelar();

    expect(mockTablas.reserva.estado).toBe("Cancelada");
    expect(mockTablas.garantia.estado).toBe("Cobro rechazado");
    expect(mockTablas.pagoEstadia).toHaveLength(0); // no se registra un cobro que no ocurrió
    expect(r).toMatchObject({ estadoCobro: "RECHAZADO", cobradoATarjeta: 0, pendienteDeCobro: 50000 });
    expect(r.mensaje).toMatch(/rechazó el cobro de .*50\.000.*Fondos insuficientes/);
  });

  test("una caída de la pasarela se trata como rechazo (no deja la cancelación a medias)", async () => {
    mockPenalidad = PRIMERA_NOCHE(50000);
    mockForzarCobro = () => {
      throw new Error("timeout");
    };
    const r = await cancelar();
    expect(mockTablas.reserva.estado).toBe("Cancelada");
    expect(r.estadoCobro).toBe("RECHAZADO");
  });

  test("sin tarjeta en garantía (reserva vieja o web): la penalidad queda pendiente, sin llamar a la pasarela", async () => {
    resetear({ garantia: undefined });
    mockPenalidad = PRIMERA_NOCHE(50000);
    const r = await cancelar();
    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(mockTablas.reserva.estado).toBe("Cancelada");
    expect(r).toMatchObject({ estadoCobro: "PENDIENTE", pendienteDeCobro: 50000 });
  });

  test("si la reserva cambió de estado (ej. check-in en paralelo): 409 y NO se cobra nada", async () => {
    mockPenalidad = PRIMERA_NOCHE(50000);
    mockTablas.reserva.estado = "En curso";
    await expect(cancelar()).rejects.toMatchObject({ statusCode: 409 });
    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(mockTablas.pagoEstadia).toHaveLength(0);
  });

  test("un error de calcularPenalidad (ej. reserva no confirmada) se propaga con su status", async () => {
    const { ErrorDeNegocio } = require("../tarifas/penalidades.servicio");
    calcularPenalidad.mockRejectedValueOnce(new ErrorDeNegocio("La reserva no está Confirmada.", 400));
    await expect(cancelar()).rejects.toMatchObject({ statusCode: 400, message: "La reserva no está Confirmada." });
    expect(mockTablas.reserva.estado).toBe("Confirmada");
  });

  test("el monto siempre sale de calcularPenalidad (nunca se calcula acá)", async () => {
    await cancelar();
    expect(calcularPenalidad).toHaveBeenCalledWith({ reservaId: 7, tipo: "CANCELACION" });
  });
});

describe("cerrarReservaConPenalidad — no-show", () => {
  const noShow = () =>
    cerrarReservaConPenalidad({ reservaId: 7, tipo: "NO_SHOW", estadoDestino: "No-show", motivo: "No-show: el huésped no se presentó." });

  test("BAR: cobra la primera noche, deja la reserva en No-show y registra el cargo como no-show", async () => {
    mockPenalidad = { aplica: true, monto: 50000, regla: "PRIMERA_NOCHE" };
    const r = await noShow();
    expect(calcularPenalidad).toHaveBeenCalledWith({ reservaId: 7, tipo: "NO_SHOW" });
    expect(mockTablas.reserva.estado).toBe("No-show");
    expect(mockTablas.pagoEstadia[0].concepto).toBe("Penalidad no-show");
    expect(r).toMatchObject({ tipo: "NO_SHOW", estadoCobro: "COBRADO", cobradoATarjeta: 50000 });
  });

  test("NRF ya pagado: no-show sin nuevo cobro (ya se cobró el total)", async () => {
    resetear({ pagos: [pago("Pago anticipado", 150000, "Tarjeta crédito")], garantia: garantiaTarjeta("Capturada") });
    mockPenalidad = { aplica: true, monto: 150000, regla: "TOTAL_ESTADIA" };
    const r = await noShow();
    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(mockTablas.reserva.estado).toBe("No-show");
    expect(r).toMatchObject({ estadoCobro: "RETENIDO", devuelto: 0 });
  });
});

describe("previsualizarCierre (la misma liquidación, sin escribir nada)", () => {
  const { previsualizarCierre } = require("./cierreReserva.servicio");

  test("muestra qué se va a cobrar a qué tarjeta y NO toca la base ni la pasarela", async () => {
    mockPenalidad = PRIMERA_NOCHE(50000);
    const antes = JSON.stringify(mockTablas);
    const p = await previsualizarCierre({ reservaId: 7, tipo: "CANCELACION" });

    expect(p).toMatchObject({
      monto: 50000,
      retenido: 0,
      devuelto: 0,
      aCobrarATarjeta: 50000,
      sinCobrar: 0,
      estadoCobro: "COBRADO",
      tarjeta: { marca: "Visa", ultimos4: "4242" },
    });
    expect(JSON.stringify(mockTablas)).toBe(antes);
    expect(procesarTarjeta).not.toHaveBeenCalled();
  });

  test("coincide con lo que después hace el cierre real", async () => {
    resetear({ pagos: [pago("Pago anticipado", 100000)], garantia: { tipo: "PREPAGO", monto: 100000, estado: "Capturada" } });
    mockPenalidad = PRIMERA_NOCHE(60000);
    const previa = await previsualizarCierre({ reservaId: 7, tipo: "CANCELACION" });
    const real = await cancelar();
    expect(previa).toMatchObject({ retenido: real.retenido, devuelto: real.devuelto, estadoCobro: real.estadoCobro });
  });

  test("sin tarjeta y con deuda: avisa que quedaría pendiente", async () => {
    resetear({ garantia: undefined });
    mockPenalidad = PRIMERA_NOCHE(50000);
    expect(await previsualizarCierre({ reservaId: 7, tipo: "CANCELACION" })).toMatchObject({
      estadoCobro: "PENDIENTE",
      sinCobrar: 50000,
      tarjeta: null,
    });
  });
});
