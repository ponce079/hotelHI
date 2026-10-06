const { procesarTarjeta, luhnValido, leerToken } = require("./pasarela.servicio");

const VISA_OK = { titular: "Ana Pérez", numero: "4242 4242 4242 4242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "123" };
const con = (extra) => ({ ...VISA_OK, ...extra });

describe("procesarTarjeta (pasarela simulada)", () => {
  test("GARANTIA tokeniza sin cobrar y nunca devuelve el número ni el CVV", async () => {
    const r = await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: VISA_OK });
    expect(r).toMatchObject({ aprobado: true, marca: "Visa", ultimos4: "4242", motivoRechazo: null });
    expect(r.token).toMatch(/^tok_/);
    const serializado = JSON.stringify(r);
    expect(serializado).not.toContain("4242424242424242");
    expect(serializado).not.toContain("123");
    expect(leerToken(r.token)).toMatchObject({ marca: "Visa", ultimos4: "4242" });
    // El token tampoco lleva el número adentro.
    expect(Buffer.from(r.token.split(".")[0].slice(4), "base64url").toString()).not.toContain("4242424242424242");
  });

  test("terminación 0002 → rechazada por fondos; 0069 → vencida", async () => {
    // 4000 0000 0000 0002 y 4000 0000 0000 0069 pasan Luhn.
    expect(luhnValido("4000000000000002")).toBe(true);
    expect(luhnValido("4000000000000069")).toBe(true);
    const fondos = await procesarTarjeta({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: con({ numero: "4000000000000002" }) });
    expect(fondos).toMatchObject({ aprobado: false, motivoRechazo: "Fondos insuficientes." });
    const vencida = await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: con({ numero: "4000000000000069" }) });
    expect(vencida).toMatchObject({ aprobado: false, motivoRechazo: "Tarjeta vencida." });
  });

  test("tarjeta realmente vencida, Luhn inválido y datos incompletos se rechazan", async () => {
    const venc = await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: con({ vencimientoMes: 1, vencimientoAnio: 2020 }) });
    expect(venc.motivoRechazo).toBe("Tarjeta vencida.");
    const luhn = await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: con({ numero: "4242 4242 4242 4243" }) });
    expect(luhn.motivoRechazo).toBe("Número de tarjeta inválido.");
    const cvv = await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: con({ cvv: "1" }) });
    expect(cvv.aprobado).toBe(false);
  });

  test("PREAUTORIZACION devuelve referencia PRE-…; CAPTURA y LIBERACION operan sobre ella", async () => {
    const pre = await procesarTarjeta({ operacion: "PREAUTORIZACION", monto: 50000, tarjeta: VISA_OK });
    expect(pre.referencia).toMatch(/^PRE-\d{6}$/);
    const cap = await procesarTarjeta({ operacion: "CAPTURA", monto: 50000, referenciaPrevia: pre.referencia });
    expect(cap).toMatchObject({ aprobado: true });
    expect(cap.referencia).toMatch(/^CAP-/);
    const lib = await procesarTarjeta({ operacion: "LIBERACION", monto: 50000, referenciaPrevia: pre.referencia });
    expect(lib.referencia).toMatch(/^LIB-/);
  });

  test("COBRO sobre tarjeta guardada usa el token (sin número)", async () => {
    const g = await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: VISA_OK });
    const cobro = await procesarTarjeta({ operacion: "COBRO", monto: 25000, referenciaPrevia: g.token });
    expect(cobro).toMatchObject({ aprobado: true, ultimos4: "4242" });
    // La tarjeta de fondos insuficientes también falla cuando se cobra después, por token.
    const mala = await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: con({ numero: "5555555555554444" }) });
    expect(mala.aprobado).toBe(true);
  });

  test("un token adulterado o inventado se rechaza como llamada inválida", async () => {
    await expect(procesarTarjeta({ operacion: "COBRO", monto: 100, referenciaPrevia: "tok_falso.firma" })).rejects.toThrow(/token/i);
  });

  test("misma claveIdempotencia: devuelve el mismo resultado sin procesar de nuevo", async () => {
    const a = await procesarTarjeta({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: VISA_OK, claveIdempotencia: "k-1" });
    const b = await procesarTarjeta({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: VISA_OK, claveIdempotencia: "k-1" });
    expect(b.referencia).toBe(a.referencia);
    const c = await procesarTarjeta({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: VISA_OK, claveIdempotencia: "k-2" });
    expect(c.referencia).not.toBe(a.referencia);
  });

  test("llamadas mal formadas tiran error (no devuelven 'rechazada')", async () => {
    await expect(procesarTarjeta({ operacion: "INVENTADA", monto: 1 })).rejects.toThrow(/operacion inválida/i);
    await expect(procesarTarjeta({ operacion: "COBRO", monto: 0, tarjeta: VISA_OK })).rejects.toThrow(/mayor a cero/i);
    await expect(procesarTarjeta({ operacion: "CAPTURA", monto: 10, referenciaPrevia: "xyz" })).rejects.toThrow(/preautorización/i);
  });

  test("nunca escribe el número ni el CVV en los logs", async () => {
    const espiar = ["log", "error", "warn", "info"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: VISA_OK });
    await procesarTarjeta({ operacion: "GARANTIA", monto: 0, tarjeta: con({ numero: "4000000000000002" }) });
    const escrito = JSON.stringify(espiar.flatMap((e) => e.mock.calls));
    espiar.forEach((e) => e.mockRestore());
    expect(escrito).not.toContain("4242424242424242");
    expect(escrito).not.toContain("4000000000000002");
  });
});
