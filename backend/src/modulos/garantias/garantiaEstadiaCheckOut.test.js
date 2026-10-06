// La garantía del check-in en el CHECK-OUT: usarla para cubrir saldo, liberarla o
// devolverla al cerrar, y devolver el saldo a favor.

let mockGarantia;
let mockPagos;
let mockCuenta;
let mockForzar;
let mockSinGuarda;

jest.mock("../../lib/prisma", () => {
  const api = {
    garantiaEstadia: {
      findUnique: async () => (mockGarantia ? { ...mockGarantia } : null),
      update: async ({ data }) => Object.assign(mockGarantia, data),
      updateMany: async ({ where, data }) => {
        if (mockSinGuarda || !mockGarantia || mockGarantia.estado !== where.estado || Number(mockGarantia.montoUsado) !== where.montoUsado) {
          return { count: 0 };
        }
        Object.assign(mockGarantia, data);
        return { count: 1 };
      },
    },
    pagoEstadia: {
      create: async ({ data }) => {
        mockPagos.push({ ...data, medios: data.medios.create });
        return data;
      },
    },
    $transaction: async (fn) => fn(api),
  };
  return api;
});
jest.mock("../check-out/checkOut.servicio", () => ({ consolidarCargos: jest.fn(async () => mockCuenta) }));
jest.mock("./pasarela.servicio", () => {
  const real = jest.requireActual("./pasarela.servicio");
  return { ...real, procesarTarjeta: jest.fn(async (p) => mockForzar?.(p) ?? real.procesarTarjeta(p)) };
});

const { aplicarGarantiaAlSaldo, cerrarGarantiaDeEstadia, registrarDevolucionSaldoAFavor } = require("./garantiaEstadiaCheckOut.servicio");
const { procesarTarjeta } = require("./pasarela.servicio");

const preautorizacion = (extra = {}) => ({
  reservaId: 7,
  tipo: "PREAUTORIZACION",
  monto: 30000,
  montoUsado: 0,
  referencia: "PRE-123456",
  marca: "Visa",
  ultimos4: "4242",
  estado: "Pendiente",
  ...extra,
});
const deposito = (extra = {}) => ({ reservaId: 7, tipo: "DEPOSITO_EFECTIVO", monto: 30000, montoUsado: 0, estado: "Pendiente", ...extra });
const ops = () => procesarTarjeta.mock.calls.map(([p]) => p.operacion);

beforeEach(() => {
  jest.clearAllMocks();
  mockGarantia = preautorizacion();
  mockPagos = [];
  mockCuenta = { estadoReserva: "En curso", saldo: 20000 };
  mockForzar = undefined;
  mockSinGuarda = false;
});

describe("aplicarGarantiaAlSaldo", () => {
  test("preautorización: captura SOLO el saldo (captura parcial) y lo registra como pago final con tarjeta", async () => {
    const r = await aplicarGarantiaAlSaldo(7);

    expect(ops()).toEqual(["CAPTURA"]);
    expect(procesarTarjeta.mock.calls[0][0]).toMatchObject({ monto: 20000, referenciaPrevia: "PRE-123456" });
    expect(mockPagos).toHaveLength(1);
    expect(mockPagos[0]).toMatchObject({ concepto: "Pago final", estado: "Pagado" });
    expect(mockPagos[0].medios[0]).toMatchObject({ medioPago: "Tarjeta crédito", importe: 20000 });
    expect(mockPagos[0].medios[0].referencia).toMatch(/^Visa \*\*\*\*4242 · aut\. CAP-\d{6}$/);
    expect(mockGarantia).toMatchObject({ estado: "Capturada", montoUsado: 20000 });
    expect(r).toMatchObject({ aplicado: 20000, medioPago: "Tarjeta crédito" });
  });

  test("si el saldo supera la garantía, se usa la garantía entera (el resto se paga con otro medio)", async () => {
    mockCuenta = { estadoReserva: "En curso", saldo: 80000 };
    const r = await aplicarGarantiaAlSaldo(7);
    expect(procesarTarjeta.mock.calls[0][0].monto).toBe(30000);
    expect(r.aplicado).toBe(30000);
  });

  test("depósito en efectivo: se aplica sin tocar la pasarela, como pago final en efectivo", async () => {
    mockGarantia = deposito();
    const r = await aplicarGarantiaAlSaldo(7);
    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(mockPagos[0].medios[0]).toMatchObject({ medioPago: "Efectivo", importe: 20000, referencia: "Depósito en garantía aplicado" });
    expect(mockGarantia).toMatchObject({ estado: "Aplicada", montoUsado: 20000 });
    expect(r.estado).toBe("Aplicada");
  });

  test("la tarjeta rechaza la captura: 502 y NO se registra ningún pago", async () => {
    mockForzar = (p) => (p.operacion === "CAPTURA" ? { aprobado: false, motivoRechazo: "Pasarela caída." } : null);
    await expect(aplicarGarantiaAlSaldo(7)).rejects.toMatchObject({ statusCode: 502 });
    expect(mockPagos).toHaveLength(0);
    expect(mockGarantia.estado).toBe("Pendiente");
  });

  test.each([
    ["sin garantía", () => (mockGarantia = null), 404],
    ["ya usada", () => (mockGarantia = preautorizacion({ estado: "Capturada", montoUsado: 20000 })), 409],
    ["cuenta saldada", () => (mockCuenta = { estadoReserva: "En curso", saldo: 0 }), 409],
    ["reserva ya cerrada", () => (mockCuenta = { estadoReserva: "Cerrada", saldo: 20000 }), 409],
  ])("%s: se rechaza y no se cobra nada", async (_n, preparar, status) => {
    preparar();
    await expect(aplicarGarantiaAlSaldo(7)).rejects.toMatchObject({ statusCode: status });
    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(mockPagos).toHaveLength(0);
  });

  test("dos clics seguidos: la guarda de estado evita registrar el pago dos veces (409)", async () => {
    mockSinGuarda = true; // otra request ya la usó entre la lectura y la escritura
    await expect(aplicarGarantiaAlSaldo(7)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPagos).toHaveLength(0);
  });
});

describe("cerrarGarantiaDeEstadia (al confirmar el check-out)", () => {
  test("preautorización sin usar: se LIBERA y no se cobra nada", async () => {
    const r = await cerrarGarantiaDeEstadia(7);
    expect(ops()).toEqual(["LIBERACION"]);
    expect(mockGarantia.estado).toBe("Liberada");
    expect(r.mensaje).toMatch(/Se liberó la preautorización de .*30\.000.*no se cobró nada/);
    expect(mockPagos).toHaveLength(0);
  });

  test("preautorización ya capturada (total o parcial): no llama a la pasarela, lo que sobró se libera solo", async () => {
    mockGarantia = preautorizacion({ estado: "Capturada", montoUsado: 20000 });
    const r = await cerrarGarantiaDeEstadia(7);
    expect(procesarTarjeta).not.toHaveBeenCalled();
    expect(r.mensaje).toMatch(/Se cobraron .*20\.000/);
  });

  test("depósito sin usar: se devuelve todo, SIN asiento negativo (nunca fue un pago)", async () => {
    mockGarantia = deposito();
    const r = await cerrarGarantiaDeEstadia(7);
    expect(mockGarantia.estado).toBe("Devuelta");
    expect(r).toMatchObject({ devolver: 30000 });
    expect(r.mensaje).toMatch(/Devolver .*30\.000 del depósito/);
    expect(mockPagos).toHaveLength(0);
  });

  test("depósito usado en parte: queda Aplicada y se devuelve lo que sobra", async () => {
    mockGarantia = deposito({ estado: "Aplicada", montoUsado: 12000 });
    const r = await cerrarGarantiaDeEstadia(7);
    expect(r).toMatchObject({ estado: "Aplicada", devolver: 18000 });
  });

  test("depósito usado completo: no hay nada que devolver", async () => {
    mockGarantia = deposito({ estado: "Aplicada", montoUsado: 30000 });
    const r = await cerrarGarantiaDeEstadia(7);
    expect(r.devolver).toBe(0);
    expect(r.mensaje).toMatch(/se usó completo/);
  });

  test("sin garantía (reservas anteriores): no hace nada", async () => {
    mockGarantia = null;
    expect(await cerrarGarantiaDeEstadia(7)).toBeNull();
  });

  test("si la pasarela falla NO tira error (el check-out ya está hecho): queda Pendiente y avisa", async () => {
    mockForzar = () => {
      throw new Error("timeout");
    };
    const espiar = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await cerrarGarantiaDeEstadia(7);
    espiar.mockRestore();
    expect(mockGarantia.estado).toBe("Pendiente");
    expect(r.mensaje).toMatch(/quedó pendiente de cerrar/);
  });
});

describe("registrarDevolucionSaldoAFavor", () => {
  const txFalso = () => ({ filas: [], pagoEstadia: { create: async function ({ data }) { txFalso.ultimo = data; return data; } } });

  test("devuelve el excedente con importe NEGATIVO, por el mismo medio que se pagó", async () => {
    const tx = txFalso();
    await registrarDevolucionSaldoAFavor(tx, { reservaId: 7, monto: 15000, medioPago: "Transferencia" });
    expect(txFalso.ultimo).toMatchObject({ concepto: "Devolución", estado: "Pagado" });
    expect(txFalso.ultimo.medios.create[0]).toMatchObject({ medioPago: "Transferencia", importe: -15000 });
  });

  test("sin excedente no registra nada", async () => {
    expect(await registrarDevolucionSaldoAFavor(txFalso(), { reservaId: 7, monto: 0 })).toBeNull();
  });
});
