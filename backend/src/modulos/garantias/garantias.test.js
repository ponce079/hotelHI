// La base real no se toca: estas pruebas son de validación pura.
jest.mock("../../lib/prisma", () => ({}));

const {
  validarGarantiaDeReserva,
  registrarGarantiaEnTransaccion,
} = require("./garantias.servicio");

const BAR = { reembolsable: true };
const NRF = { reembolsable: false };
const SALIDA = new Date("2027-03-12T00:00:00.000Z");
const TARJETA = { titular: "Ana Pérez", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "123" };

const validar = (garantia, plan = BAR, total = 100000) =>
  validarGarantiaDeReserva({ garantia, plan, totalEsperado: total, fechaHasta: SALIDA });

describe("validarGarantiaDeReserva", () => {
  test("BAR con tarjeta: válida y sin cobro", () => {
    expect(validar({ tipo: "TARJETA", tarjeta: TARJETA })).toMatchObject({ tipo: "TARJETA", cobraTotal: false });
  });
  test("NRF con tarjeta: cobra el total", () => {
    expect(validar({ tipo: "TARJETA", tarjeta: TARJETA }, NRF)).toMatchObject({ cobraTotal: true });
  });
  test("tarjeta que vence antes de la salida: rechazada", () => {
    // vence 02/27, la salida es el 12/03/27
    expect(() => validar({ tipo: "TARJETA", tarjeta: { ...TARJETA, vencimientoMes: 2, vencimientoAnio: 2027 } })).toThrow(/vence antes/i);
  });
  test("vence el mismo mes de la salida: sirve (vence el último día del mes)", () => {
    expect(() => validar({ tipo: "TARJETA", tarjeta: { ...TARJETA, vencimientoMes: 3, vencimientoAnio: 2027 } })).not.toThrow();
  });
  test("Luhn inválido, sin titular o sin CVV: rechazada antes de llamar a la pasarela", () => {
    expect(() => validar({ tipo: "TARJETA", tarjeta: { ...TARJETA, numero: "4242424242424243" } })).toThrow(/inválido/i);
    expect(() => validar({ tipo: "TARJETA", tarjeta: { ...TARJETA, titular: " " } })).toThrow(/titular/i);
    expect(() => validar({ tipo: "TARJETA", tarjeta: { ...TARJETA, cvv: "" } })).toThrow(/seguridad/i);
  });
  test("NRF sin tarjeta: solo prepago por el total", () => {
    const medios = (importe) => [{ tipo: "Transferencia", importe }];
    expect(() => validar({ tipo: "PREPAGO", medios: medios(50000) }, NRF)).toThrow(/prepago por el total/i);
    expect(validar({ tipo: "PREPAGO", medios: medios(100000) }, NRF)).toMatchObject({ monto: 100000 });
  });
  test("BAR con prepago parcial: válido; que supere el total, no", () => {
    expect(validar({ tipo: "PREPAGO", medios: [{ tipo: "Online", importe: 30000 }] })).toMatchObject({ monto: 30000 });
    expect(() => validar({ tipo: "PREPAGO", medios: [{ tipo: "Online", importe: 200000 }] })).toThrow(/superar/i);
  });
  test("prepago: efectivo y crédito no son medios válidos; débito pide referencia", () => {
    expect(() => validar({ tipo: "PREPAGO", medios: [{ tipo: "Efectivo", importe: 1000 }] })).toThrow(/medio de prepago/i);
    expect(() => validar({ tipo: "PREPAGO", medios: [{ tipo: "Tarjeta débito", importe: 1000 }] })).toThrow(/autorización/i);
  });
  test("tipo inválido y reserva no garantizada (todavía no disponible)", () => {
    expect(() => validar({ tipo: "OTRO" })).toThrow(/garantia\.tipo/);
    expect(() => validar({ tipo: "NO_GARANTIZADA" })).toThrow(/no está disponible/i);
    expect(() => validar(undefined)).toThrow(/garantia\.tipo/);
  });
});

describe("registrarGarantiaEnTransaccion (función que usa el e-commerce)", () => {
  const txFalsa = () => {
    const filas = [];
    return { filas, garantiaReserva: { create: async ({ data }) => (filas.push(data), { id: filas.length, ...data }) } };
  };
  const base = { reservaId: 7, tipo: "TARJETA", token: "tok_x.y", marca: "Visa", ultimos4: "4242", vencimiento: "12/99", referencia: "GAR-000001", monto: 0, estado: "Vigente" };

  test("guarda token, marca, últimos 4 y vencimiento — y nada más de la tarjeta", async () => {
    const tx = txFalsa();
    await registrarGarantiaEnTransaccion(tx, base);
    expect(Object.keys(tx.filas[0]).sort()).toEqual(
      ["estado", "marca", "monto", "referencia", "reservaId", "tipo", "token", "ultimos4", "vencimiento"]
    );
    expect(JSON.stringify(tx.filas[0])).not.toMatch(/numero|cvv/i);
  });
  test("rechaza datos incompletos o inválidos", async () => {
    const tx = txFalsa();
    await expect(registrarGarantiaEnTransaccion(tx, { ...base, token: null })).rejects.toThrow(/token/i);
    await expect(registrarGarantiaEnTransaccion(tx, { ...base, ultimos4: "42" })).rejects.toThrow(/ultimos4/);
    await expect(registrarGarantiaEnTransaccion(tx, { ...base, vencimiento: "2099-12" })).rejects.toThrow(/MM\/AA/);
    await expect(registrarGarantiaEnTransaccion(tx, { ...base, estado: "Rara" })).rejects.toThrow(/estado/);
    await expect(registrarGarantiaEnTransaccion(tx, { ...base, monto: -1 })).rejects.toThrow(/negativo/);
    expect(tx.filas).toHaveLength(0);
  });
});
