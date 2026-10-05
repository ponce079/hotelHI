const { OPERACION, MOTIVO, procesarTarjeta, marcaDe, _soloTest } = require("./pasarelaSimulada");

const tarjeta = (numero) => ({ titular: "PRUEBA", numero, vencimientoMes: 12, vencimientoAnio: 2030, cvv: "987" });
const VISA = "4242424242424242";
const FONDOS = "4000000000000002";
const VENCIDA = "4000000000000069";

beforeEach(() => _soloTest.reiniciar());

describe("operaciones con tarjeta", () => {
  test("GARANTIA de monto 0 aprueba y devuelve token, marca y últimos 4 (nunca el número)", async () => {
    const r = await procesarTarjeta({ operacion: OPERACION.GARANTIA, monto: 0, tarjeta: tarjeta(VISA), claveIdempotencia: "k1" });
    expect(r).toMatchObject({ aprobado: true, marca: "VISA", ultimos4: "4242", motivoRechazo: null });
    expect(r.token).toMatch(/^TOK-/);
    expect(r.referencia).toMatch(/^GAR-/);
    expect(JSON.stringify(r)).not.toContain(VISA);
  });

  test("0002: acepta la GARANTIA pero rechaza PREAUTORIZACION y COBRO por fondos insuficientes", async () => {
    expect((await procesarTarjeta({ operacion: OPERACION.GARANTIA, monto: 0, tarjeta: tarjeta(FONDOS) })).aprobado).toBe(true);
    for (const operacion of [OPERACION.PREAUTORIZACION, OPERACION.COBRO]) {
      expect(await procesarTarjeta({ operacion, monto: 1000, tarjeta: tarjeta(FONDOS) })).toMatchObject({
        aprobado: false,
        motivoRechazo: MOTIVO.FONDOS,
      });
    }
  });

  test("0069 rechaza todo como tarjeta vencida", async () => {
    for (const operacion of [OPERACION.GARANTIA, OPERACION.PREAUTORIZACION, OPERACION.COBRO]) {
      expect(await procesarTarjeta({ operacion, monto: 1000, tarjeta: tarjeta(VENCIDA) })).toMatchObject({
        aprobado: false,
        motivoRechazo: MOTIVO.VENCIDA,
      });
    }
  });

  test("un número que no pasa Luhn se rechaza", async () => {
    expect((await procesarTarjeta({ operacion: OPERACION.GARANTIA, monto: 0, tarjeta: tarjeta("4242424242424241") })).aprobado).toBe(false);
  });

  test("marca por prefijo", () => {
    expect(marcaDe("4111111111111111")).toBe("VISA");
    expect(marcaDe("5555555555554444")).toBe("MASTERCARD");
    expect(marcaDe("2221000000000009")).toBe("MASTERCARD");
    expect(marcaDe("2720990000000007")).toBe("MASTERCARD");
    expect(marcaDe("378282246310005")).toBe("AMEX");
    expect(marcaDe("341111111111111")).toBe("AMEX");
    expect(marcaDe("6011111111111117")).toBe("OTRA");
  });

  test("idempotente por (clave, operación): repetir devuelve el mismo resultado", async () => {
    const a = await procesarTarjeta({ operacion: OPERACION.PREAUTORIZACION, monto: 5000, tarjeta: tarjeta(VISA), claveIdempotencia: "k2" });
    const b = await procesarTarjeta({ operacion: OPERACION.PREAUTORIZACION, monto: 5000, tarjeta: tarjeta(VISA), claveIdempotencia: "k2" });
    expect(b).toEqual(a);
  });
});

describe("preautorizaciones", () => {
  async function preautorizar() {
    const r = await procesarTarjeta({ operacion: OPERACION.PREAUTORIZACION, monto: 5000, tarjeta: tarjeta(VISA) });
    expect(_soloTest.estadoPreautorizacion(r.referencia)).toBe("pendiente");
    return r.referencia;
  }

  test("CAPTURA de una pendiente la deja capturada; una segunda captura o una liberación se rechazan", async () => {
    const ref = await preautorizar();
    expect((await procesarTarjeta({ operacion: OPERACION.CAPTURA, referenciaPrevia: ref })).aprobado).toBe(true);
    expect(_soloTest.estadoPreautorizacion(ref)).toBe("capturada");
    expect(await procesarTarjeta({ operacion: OPERACION.CAPTURA, referenciaPrevia: ref })).toMatchObject({
      aprobado: false,
      motivoRechazo: MOTIVO.REFERENCIA,
    });
    expect((await procesarTarjeta({ operacion: OPERACION.LIBERACION, referenciaPrevia: ref })).aprobado).toBe(false);
  });

  test("LIBERACION de una pendiente la deja liberada", async () => {
    const ref = await preautorizar();
    expect((await procesarTarjeta({ operacion: OPERACION.LIBERACION, referenciaPrevia: ref })).aprobado).toBe(true);
    expect(_soloTest.estadoPreautorizacion(ref)).toBe("liberada");
  });

  test("referencia desconocida → rechazo", async () => {
    expect((await procesarTarjeta({ operacion: OPERACION.CAPTURA, referenciaPrevia: "PRE-NOEXISTE" })).aprobado).toBe(false);
  });

  test("falla de CAPTURA forzada solo para tests: la preautorización sigue pendiente", async () => {
    const ref = await preautorizar();
    _soloTest.forzarFallaDeCaptura();
    expect((await procesarTarjeta({ operacion: OPERACION.CAPTURA, referenciaPrevia: ref })).aprobado).toBe(false);
    expect(_soloTest.estadoPreautorizacion(ref)).toBe("pendiente");
  });
});

test("operación desconocida tira error", async () => {
  await expect(procesarTarjeta({ operacion: "REEMBOLSO" })).rejects.toThrow(/desconocida/);
});
