// Observación 3: el comprobante detalla los cargos adicionales y el total lo
// fija el servidor desde la cuenta consolidada.

let mockCuenta;
let mockCreados;
let mockComprobante;

jest.mock("../../lib/prisma", () => {
  const api = {
    reserva: { findUnique: async () => ({ id: 7, estado: "En curso" }) },
    comprobanteEstadia: {
      findFirst: async () => null,
      findUnique: async () => (mockComprobante ? { ...mockComprobante } : null),
      create: async ({ data }) => {
        mockCreados.push(data);
        return { id: 1, ...data };
      },
      update: async ({ data }) => ({ ...mockCreados[0], id: 1, ...data }),
    },
    pagoEstadia: {
      findMany: async () => [
        { concepto: "Pago de estadía", medios: [{ medioPago: "Tarjeta crédito", importe: "110000", referencia: "Visa ****4242" }] },
      ],
    },
    $transaction: async (fn) => fn(api),
  };
  return api;
});
jest.mock("../check-out/checkOut.servicio", () => ({ consolidarCargos: jest.fn(async () => mockCuenta) }));

const { armarDetalleCuenta } = require("./comprobanteDetalle");
const servicio = require("./comprobanteEstadia.servicio");

const cuentaBase = () => ({
  reservaId: 7,
  habitaciones: [
    { habitacionId: 1, numero: "101", tipo: "Doble", noches: 2, promedioPorNoche: 50000, subtotal: 100000 },
  ],
  consumos: [
    { id: 1, habitacionId: 1, tipoServicio: "Minibar", cantidad: 2, monto: 3000, fechaHora: "2026-10-05T12:00:00Z" },
    { id: 2, habitacionId: 1, tipoServicio: "Lavandería", cantidad: null, monto: 4500, fechaHora: "2026-10-05T15:00:00Z" },
  ],
  verificaciones: [
    { id: 1, habitacionId: 1, tipo: "Daño", descripcion: "Toalla manchada", monto: 2500, fechaHora: "2026-10-06T10:00:00Z" },
    { id: 2, habitacionId: 1, tipo: "SinNovedades", descripcion: "ok", monto: 0, fechaHora: "2026-10-06T10:01:00Z" },
  ],
  totalAdeudado: 110000,
});

beforeEach(() => {
  mockCuenta = cuentaBase();
  mockCreados = [];
  mockComprobante = null;
});

describe("armarDetalleCuenta", () => {
  it("separa alojamiento, cargos adicionales y verificación, y suma al total de la cuenta", () => {
    const d = armarDetalleCuenta(mockCuenta);
    expect(d.lineas.map((l) => l.categoria)).toEqual([
      "Alojamiento",
      "Cargos adicionales",
      "Cargos adicionales",
      "Verificación de la habitación",
    ]);
    expect(d.lineas[0]).toMatchObject({ concepto: "Habitación 101 (Doble)", cantidad: 2, precioUnitario: 50000, importe: 100000 });
    expect(d.lineas[1]).toMatchObject({ concepto: "Minibar", habitacion: "101", importe: 3000 });
    expect(d.lineas[3]).toMatchObject({ concepto: "Daño en la habitación", importe: 2500 });
    expect(d.subtotales).toEqual({ alojamiento: 100000, cargosAdicionales: 7500, verificacion: 2500 });
    expect(d.total).toBe(110000);
    expect(d.coincide).toBe(true);
  });

  it("no lista la verificación sin novedades (monto 0)", () => {
    const d = armarDetalleCuenta(mockCuenta);
    expect(d.lineas.some((l) => l.concepto === "SinNovedades")).toBe(false);
  });

  it("sin cargos adicionales queda solo el alojamiento", () => {
    mockCuenta.consumos = [];
    mockCuenta.verificaciones = [];
    mockCuenta.totalAdeudado = 100000;
    const d = armarDetalleCuenta(mockCuenta);
    expect(d.lineas).toHaveLength(1);
    expect(d.coincide).toBe(true);
  });

  it("avisa si las líneas no suman el total de la cuenta", () => {
    mockCuenta.totalAdeudado = 999;
    expect(armarDetalleCuenta(mockCuenta).coincide).toBe(false);
  });
});

describe("crearComprobante — total desde la cuenta", () => {
  it("sin importe usa el total adeudado de la cuenta (neto + IVA = total)", async () => {
    await servicio.crearComprobante({ reservaId: 7, alicuotaIVA: 21 });
    expect(mockCreados[0].importeTotal).toBe(110000);
    expect(mockCreados[0].importeNeto + mockCreados[0].importeIVA).toBeCloseTo(110000, 2);
  });

  it("acepta un importeTotal que coincide con la cuenta", async () => {
    await servicio.crearComprobante({ reservaId: 7, alicuotaIVA: 21, importeTotal: 110000 });
    expect(mockCreados[0].importeTotal).toBe(110000);
  });

  it("rechaza (409) un importeTotal que no coincide con la cuenta", async () => {
    await expect(servicio.crearComprobante({ reservaId: 7, alicuotaIVA: 21, importeTotal: 50000 })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockCreados).toHaveLength(0);
  });
});

describe("obtenerComprobante — detalle", () => {
  it("el Comprobante trae el detalle de la cuenta", async () => {
    mockComprobante = { id: 1, reservaId: 7, tipo: "Comprobante", importeTotal: 110000 };
    const c = await servicio.obtenerComprobante(1);
    expect(c.detalle.lineas).toHaveLength(4);
    expect(c.detalle.total).toBe(110000);
    // Medios de pago para el encabezado del comprobante (un renglón por medio de cada pago vigente).
    expect(c.mediosDePago).toEqual([{ concepto: "Pago de estadía", medioPago: "Tarjeta crédito", importe: 110000, referencia: "Visa ****4242" }]);
  });

  it("la Nota de Crédito no lleva detalle", async () => {
    mockComprobante = { id: 2, reservaId: 7, tipo: "Nota de Crédito", importeTotal: 1000 };
    expect((await servicio.obtenerComprobante(2)).detalle).toBeNull();
  });

  it("si la cuenta no se puede armar, la ficha igual se devuelve (detalle null)", async () => {
    mockComprobante = { id: 1, reservaId: 7, tipo: "Comprobante", importeTotal: 1 };
    const { consolidarCargos } = require("../check-out/checkOut.servicio");
    consolidarCargos.mockRejectedValueOnce(new Error("sin precio"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await servicio.obtenerComprobante(1)).detalle).toBeNull();
  });
});
