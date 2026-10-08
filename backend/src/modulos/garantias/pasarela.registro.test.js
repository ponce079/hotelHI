// Registro persistente de la pasarela simulada (pasarela_operaciones): idempotencia que sobrevive al reinicio y
// control de estado de las preautorizaciones, con UN test por cada secuencia real que hacen los flujos de garantías
// (ver la tabla de secuencias en docs/garantia-tarjeta.md). La base se reemplaza por el doble en memoria.
const mockDoble = require("./pasarelaRegistro.doble");
jest.mock("./pasarelaRegistro", () => mockDoble);
jest.mock("../../lib/prisma", () => ({}));

let pasarela = require("./pasarela.servicio");
const { ESTADO_PREAUTORIZACION: ESTADO } = pasarela;

const NUMERO = "4242424242424242";
const CVV = "987";
const TARJETA = { titular: "ANA PEREZ", numero: NUMERO, vencimientoMes: 12, vencimientoAnio: 2099, cvv: CVV };

const procesar = (p) => pasarela.procesarTarjeta(p);
const preautorizar = async (monto = 30000, extra = {}) => {
  const r = await procesar({ operacion: "PREAUTORIZACION", monto, tarjeta: TARJETA, ...extra });
  expect(r.aprobado).toBe(true);
  return r.referencia;
};
const estadoDe = (referencia) => mockDoble._filaPorReferencia(referencia)?.estadoPreautorizacion;
const capturadoDe = (referencia) => Number(mockDoble._filaPorReferencia(referencia)?.montoCapturado);
const operacionesRegistradas = () => mockDoble.filas().map((f) => f.operacion);

// "Reinicio del backend": el módulo se vuelve a cargar (se pierde cualquier caché en memoria), pero la
// base (el doble) conserva todo lo registrado.
function reiniciarBackend() {
  jest.resetModules();
  jest.doMock("./pasarelaRegistro", () => mockDoble);
  jest.doMock("../../lib/prisma", () => ({}));
  pasarela = require("./pasarela.servicio");
}

beforeEach(() => {
  mockDoble.reiniciar();
  jest.restoreAllMocks();
  pasarela = require("./pasarela.servicio");
});

describe("secuencia 1 — alta BAR: GARANTIA", () => {
  test("tokeniza, registra la operación (sin número ni CVV) y no hay estado de preautorización", async () => {
    const r = await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA, claveIdempotencia: "alta-1" });
    expect(r).toMatchObject({ aprobado: true, marca: "Visa", ultimos4: "4242" });
    expect(r.referencia).toMatch(/^GAR-\d{6}$/);
    const [fila] = mockDoble.filas();
    expect(fila).toMatchObject({ operacion: "GARANTIA", aprobada: true, claveIdempotencia: "GARANTIA:alta-1", estadoPreautorizacion: null, ultimos4: "4242" });
    expect(JSON.stringify(mockDoble.filas())).not.toContain(NUMERO);
    expect(JSON.stringify(mockDoble.filas())).not.toContain(`"${CVV}"`);
  });

  test("idempotencia tras un REINICIO: la misma clave devuelve el mismo token y referencia, sin operación nueva", async () => {
    const primera = await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA, claveIdempotencia: "alta-1" });
    reiniciarBackend();
    const repetida = await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA, claveIdempotencia: "alta-1" });
    expect(repetida).toEqual(primera);
    expect(mockDoble.filas()).toHaveLength(1);
  });

  test("el rechazo también se guarda: el mismo pedido repetido devuelve el mismo rechazo", async () => {
    const mala = { ...TARJETA, numero: "4000000000000002" };
    const primera = await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: mala, claveIdempotencia: "alta-2" });
    expect(primera).toMatchObject({ aprobado: false, motivoRechazo: "Fondos insuficientes." });
    reiniciarBackend();
    expect(await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: mala, claveIdempotencia: "alta-2" })).toEqual(primera);
    expect(mockDoble.filas()).toHaveLength(1);
    expect(mockDoble.filas()[0]).toMatchObject({ aprobada: false, motivo: "Fondos insuficientes." });
  });

  test("la misma clave con otra operación es otra operación", async () => {
    await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA, claveIdempotencia: "k" });
    await procesar({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: TARJETA, claveIdempotencia: "k" });
    expect(mockDoble.filas().map((f) => f.claveIdempotencia)).toEqual(["GARANTIA:k", "PREAUTORIZACION:k"]);
  });

  test("sin clave de idempotencia no hay repetición: cada llamada es una operación nueva", async () => {
    await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA });
    await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA });
    expect(mockDoble.filas()).toHaveLength(2);
  });
});

describe("secuencia 2 — alta NRF: PREAUTORIZACION total → CAPTURA total", () => {
  test("queda Capturada con el monto capturado, y una segunda captura se rechaza", async () => {
    const pre = await preautorizar(90000, { claveIdempotencia: "nrf-1" });
    expect(estadoDe(pre)).toBe(ESTADO.VIGENTE);
    const cap = await procesar({ operacion: "CAPTURA", monto: 90000, referenciaPrevia: pre, claveIdempotencia: "nrf-1:cap" });
    expect(cap).toMatchObject({ aprobado: true });
    expect(cap.referencia).toMatch(/^CAP-\d{6}$/);
    expect(estadoDe(pre)).toBe(ESTADO.CAPTURADA);
    expect(capturadoDe(pre)).toBe(90000);

    const otra = await procesar({ operacion: "CAPTURA", monto: 90000, referenciaPrevia: pre });
    expect(otra).toMatchObject({ aprobado: false, motivoRechazo: "La preautorización ya fue capturada." });
    expect(capturadoDe(pre)).toBe(90000);
  });

  test("capturada por COMPLETO no admite liberación (no hay remanente)", async () => {
    const pre = await preautorizar(90000);
    await procesar({ operacion: "CAPTURA", monto: 90000, referenciaPrevia: pre });
    const lib = await procesar({ operacion: "LIBERACION", monto: 90000, referenciaPrevia: pre });
    expect(lib).toMatchObject({ aprobado: false, motivoRechazo: "La preautorización se capturó por completo: no hay remanente que liberar." });
    expect(estadoDe(pre)).toBe(ESTADO.CAPTURADA);
  });

  test("el reintento de la captura con la misma clave tras un reinicio devuelve la misma captura, sin otra operación", async () => {
    const pre = await preautorizar(90000);
    const cap = await procesar({ operacion: "CAPTURA", monto: 90000, referenciaPrevia: pre, claveIdempotencia: "cap-1" });
    const filas = mockDoble.filas().length;
    reiniciarBackend();
    expect(await procesar({ operacion: "CAPTURA", monto: 90000, referenciaPrevia: pre, claveIdempotencia: "cap-1" })).toEqual(cap);
    expect(mockDoble.filas()).toHaveLength(filas);
  });
});

describe("secuencia 3 — falla de la captura en el alta NRF → LIBERACION", () => {
  test("si el registro no puede escribir la captura, se informa como error de la pasarela y la preautorización sigue Vigente (se puede liberar)", async () => {
    const pre = await preautorizar(90000);
    jest.spyOn(mockDoble, "transicionarYCrear").mockRejectedValueOnce(new Error("se cayó la base"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(procesar({ operacion: "CAPTURA", monto: 90000, referenciaPrevia: pre })).rejects.toMatchObject({ statusCode: 502 });
    expect(estadoDe(pre)).toBe(ESTADO.VIGENTE);

    const lib = await procesar({ operacion: "LIBERACION", monto: 90000, referenciaPrevia: pre, claveIdempotencia: "x:lib" });
    expect(lib.aprobado).toBe(true);
    expect(estadoDe(pre)).toBe(ESTADO.LIBERADA);
  });
});

describe("secuencia 4 — falla de la transacción del alta o del check-in: LIBERACION de la retención", () => {
  test("PREAUTORIZACION → LIBERACION: queda Liberada y una segunda liberación se rechaza", async () => {
    const pre = await preautorizar(90000);
    const lib = await procesar({ operacion: "LIBERACION", monto: 90000, referenciaPrevia: pre, claveIdempotencia: "a:lib" });
    expect(lib).toMatchObject({ aprobado: true });
    expect(lib.referencia).toMatch(/^LIB-\d{6}$/);
    expect(estadoDe(pre)).toBe(ESTADO.LIBERADA);

    const otra = await procesar({ operacion: "LIBERACION", monto: 90000, referenciaPrevia: pre });
    expect(otra).toMatchObject({ aprobado: false, motivoRechazo: "La preautorización ya fue liberada." });
  });

  test("una preautorización liberada no se puede capturar", async () => {
    const pre = await preautorizar(90000);
    await procesar({ operacion: "LIBERACION", monto: 90000, referenciaPrevia: pre });
    const cap = await procesar({ operacion: "CAPTURA", monto: 90000, referenciaPrevia: pre });
    expect(cap).toMatchObject({ aprobado: false, motivoRechazo: "La preautorización ya fue liberada." });
  });

  test("el reintento idempotente de la liberación tras un reinicio devuelve la misma liberación", async () => {
    const pre = await preautorizar(90000);
    const lib = await procesar({ operacion: "LIBERACION", monto: 90000, referenciaPrevia: pre, claveIdempotencia: "z:lib" });
    reiniciarBackend();
    expect(await procesar({ operacion: "LIBERACION", monto: 90000, referenciaPrevia: pre, claveIdempotencia: "z:lib" })).toEqual(lib);
  });
});

describe("secuencia 5 — preautorización del check-in (monto fijo, por token o con tarjeta nueva)", () => {
  test("por TOKEN de la tarjeta guardada: PREAUTORIZACION aprobada y Vigente, sin tarjeta ni CVV", async () => {
    const garantia = await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA });
    const pre = await procesar({ operacion: "PREAUTORIZACION", monto: 30000, referenciaPrevia: garantia.token, claveIdempotencia: "checkin-7" });
    expect(pre).toMatchObject({ aprobado: true, marca: "Visa", ultimos4: "4242", token: garantia.token });
    expect(estadoDe(pre.referencia)).toBe(ESTADO.VIGENTE);
    const fila = mockDoble._filaPorReferencia(pre.referencia);
    expect(fila.referenciaPrevia).toBe(garantia.token);
    expect(Number(fila.monto)).toBe(30000);
  });

  test("con tarjeta NUEVA (walk-in): devuelve también el token, y el reintento tras reiniciar devuelve el mismo", async () => {
    const pre = await procesar({ operacion: "PREAUTORIZACION", monto: 30000, tarjeta: TARJETA, claveIdempotencia: "walkin-1" });
    expect(pre.token).toMatch(/^tok_/);
    reiniciarBackend();
    const repetida = await procesar({ operacion: "PREAUTORIZACION", monto: 30000, tarjeta: TARJETA, claveIdempotencia: "walkin-1" });
    expect(repetida).toEqual(pre);
    expect(mockDoble.filas().filter((f) => f.operacion === "PREAUTORIZACION")).toHaveLength(1);
  });

  test("tarjeta rechazada (0002 fondos / 0069 vencida): no hay preautorización", async () => {
    const fondos = await procesar({ operacion: "PREAUTORIZACION", monto: 30000, tarjeta: { ...TARJETA, numero: "4000000000000002" } });
    const vencida = await procesar({ operacion: "PREAUTORIZACION", monto: 30000, tarjeta: { ...TARJETA, numero: "4000000000000069" } });
    expect(fondos).toMatchObject({ aprobado: false, motivoRechazo: "Fondos insuficientes." });
    expect(vencida).toMatchObject({ aprobado: false, motivoRechazo: "Tarjeta vencida." });
    expect(mockDoble.filas().every((f) => f.estadoPreautorizacion === null)).toBe(true);
  });
});

describe("secuencia 6 — check-out: la garantía cubre el saldo (CAPTURA PARCIAL cierra sola)", () => {
  test("captura parcial: queda 'Capturada, remanente liberado' con el monto capturado, sin liberación aparte", async () => {
    const pre = await preautorizar(30000);
    const cap = await procesar({ operacion: "CAPTURA", monto: 18000, referenciaPrevia: pre, claveIdempotencia: "captura-estadia:7" });
    expect(cap.aprobado).toBe(true);
    expect(estadoDe(pre)).toBe(ESTADO.REMANENTE_LIBERADO);
    expect(estadoDe(pre)).toBe("Capturada, remanente liberado");
    expect(capturadoDe(pre)).toBe(18000);
    expect(operacionesRegistradas()).toEqual(["PREAUTORIZACION", "CAPTURA"]);
  });

  test("después de la captura parcial, una LIBERACION se rechaza: 'La preautorización ya fue cerrada.'", async () => {
    const pre = await preautorizar(30000);
    await procesar({ operacion: "CAPTURA", monto: 18000, referenciaPrevia: pre });
    const lib = await procesar({ operacion: "LIBERACION", monto: 12000, referenciaPrevia: pre });
    expect(lib).toMatchObject({ aprobado: false, motivoRechazo: "La preautorización ya fue cerrada." });
    const otra = await procesar({ operacion: "CAPTURA", monto: 1000, referenciaPrevia: pre });
    expect(otra).toMatchObject({ aprobado: false, motivoRechazo: "La preautorización ya fue capturada." });
    expect(estadoDe(pre)).toBe(ESTADO.REMANENTE_LIBERADO);
    expect(capturadoDe(pre)).toBe(18000);
  });

  test("captura por el total retenido: queda 'Capturada' (no hay remanente)", async () => {
    const pre = await preautorizar(30000);
    await procesar({ operacion: "CAPTURA", monto: 30000, referenciaPrevia: pre });
    expect(estadoDe(pre)).toBe(ESTADO.CAPTURADA);
  });

  test("capturar por MÁS de lo preautorizado se rechaza y la preautorización sigue Vigente (se puede capturar bien después)", async () => {
    const pre = await preautorizar(30000);
    const mucho = await procesar({ operacion: "CAPTURA", monto: 30001, referenciaPrevia: pre });
    expect(mucho).toMatchObject({ aprobado: false, motivoRechazo: "El monto a capturar supera el monto preautorizado." });
    expect(estadoDe(pre)).toBe(ESTADO.VIGENTE);
    const bien = await procesar({ operacion: "CAPTURA", monto: 30000, referenciaPrevia: pre });
    expect(bien.aprobado).toBe(true);
  });

  test("dos clics seguidos con la misma clave: la segunda captura devuelve la primera (no captura dos veces)", async () => {
    const pre = await preautorizar(30000);
    const [a, b] = await Promise.all([
      procesar({ operacion: "CAPTURA", monto: 18000, referenciaPrevia: pre, claveIdempotencia: "captura-estadia:9" }),
      procesar({ operacion: "CAPTURA", monto: 18000, referenciaPrevia: pre, claveIdempotencia: "captura-estadia:9" }),
    ]);
    expect(a).toEqual(b);
    expect(mockDoble.filas().filter((f) => f.operacion === "CAPTURA")).toHaveLength(1);
  });
});

describe("secuencia 7 — check-out sin usar la garantía: LIBERACION del total retenido", () => {
  test("PREAUTORIZACION → LIBERACION (monto completo): Liberada", async () => {
    const pre = await preautorizar(30000);
    const lib = await procesar({ operacion: "LIBERACION", monto: 30000, referenciaPrevia: pre, claveIdempotencia: "liberar-estadia:7" });
    expect(lib.aprobado).toBe(true);
    expect(estadoDe(pre)).toBe(ESTADO.LIBERADA);
  });

  test("liberar más de lo retenido se rechaza", async () => {
    const pre = await preautorizar(30000);
    const lib = await procesar({ operacion: "LIBERACION", monto: 30001, referenciaPrevia: pre });
    expect(lib).toMatchObject({ aprobado: false, motivoRechazo: "El monto a liberar supera lo retenido." });
    expect(estadoDe(pre)).toBe(ESTADO.VIGENTE);
  });
});

describe("secuencias 8 y 9 — cancelación con penalidad y no-show: COBRO por token", () => {
  test("COBRO sobre la tarjeta guardada (token): aprobado, sin estado de preautorización, con idempotencia que sobrevive al reinicio", async () => {
    const garantia = await procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA });
    const cobro = await procesar({ operacion: "COBRO", monto: 40000, referenciaPrevia: garantia.token, claveIdempotencia: "penalidad:12:CANCELACION" });
    expect(cobro).toMatchObject({ aprobado: true, ultimos4: "4242" });
    expect(cobro.referencia).toMatch(/^COB-\d{6}$/);
    const fila = mockDoble._filaPorReferencia(cobro.referencia);
    expect(fila).toMatchObject({ operacion: "COBRO", estadoPreautorizacion: null });
    expect(Number(fila.monto)).toBe(40000);

    reiniciarBackend();
    const repetido = await procesar({ operacion: "COBRO", monto: 40000, referenciaPrevia: garantia.token, claveIdempotencia: "penalidad:12:CANCELACION" });
    expect(repetido).toEqual(cobro);
    expect(mockDoble.filas().filter((f) => f.operacion === "COBRO")).toHaveLength(1);
  });

  test("un token adulterado es una llamada inválida (error, no un rechazo) y no se registra nada", async () => {
    await expect(procesar({ operacion: "COBRO", monto: 1000, referenciaPrevia: "tok_inventado.firma" })).rejects.toThrow(/token de tarjeta válido/);
    expect(mockDoble.filas()).toHaveLength(0);
  });
});

describe("referencias desconocidas y llamadas mal formadas", () => {
  test("CAPTURA y LIBERACION de una referencia que no está en el registro: rechazadas con 'Preautorización desconocida'", async () => {
    for (const operacion of ["CAPTURA", "LIBERACION"]) {
      const r = await procesar({ operacion, monto: 1000, referenciaPrevia: "PRE-999999" });
      expect(r).toMatchObject({ aprobado: false, referencia: null, motivoRechazo: "Preautorización desconocida." });
    }
  });

  test("una referencia que no es de una PREAUTORIZACION (GAR-, COB-) o mal formada es una llamada inválida", async () => {
    await expect(procesar({ operacion: "CAPTURA", monto: 1000, referenciaPrevia: "GAR-123456" })).rejects.toThrow(/referencia de una preautorización/);
    await expect(procesar({ operacion: "LIBERACION", monto: 1000, referenciaPrevia: undefined })).rejects.toThrow(/referencia de una preautorización/);
  });

  test("una preautorización RECHAZADA no existe para el registro (no se puede capturar)", async () => {
    const rechazada = await procesar({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: { ...TARJETA, numero: "4000000000000002" } });
    expect(rechazada.referencia).toBeNull();
    const r = await procesar({ operacion: "CAPTURA", monto: 1000, referenciaPrevia: "PRE-000001" });
    expect(r.motivoRechazo).toBe("Preautorización desconocida.");
  });

  test("las demás validaciones de siempre (monto, operación) siguen igual", async () => {
    await expect(procesar({ operacion: "GARANTIA", monto: -1, tarjeta: TARJETA })).rejects.toThrow(/monto inválido/);
    await expect(procesar({ operacion: "REEMBOLSO", monto: 1, tarjeta: TARJETA })).rejects.toThrow(/operacion inválida/);
    await expect(procesar({ operacion: "COBRO", monto: 0, tarjeta: TARJETA })).rejects.toThrow(/mayor a cero/);
    await expect(procesar({ operacion: "CAPTURA", monto: 0, referenciaPrevia: "PRE-000001" })).rejects.toThrow(/mayor a cero/);
  });
});

describe("el registro nunca aprueba en silencio", () => {
  test("si la escritura falla, la operación se informa como error de la pasarela (502) y no devuelve una aprobación", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(mockDoble, "crear").mockRejectedValue(new Error("base caída"));
    await expect(procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA, claveIdempotencia: "k" })).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringMatching(/no se procesó nada/),
    });
  });

  test("si la lectura de la clave falla, tampoco se procesa", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(mockDoble, "buscarPorClave").mockRejectedValue(new Error("base caída"));
    await expect(procesar({ operacion: "GARANTIA", monto: 0, tarjeta: TARJETA, claveIdempotencia: "k" })).rejects.toMatchObject({ statusCode: 502 });
    expect(mockDoble.filas()).toHaveLength(0);
  });
});

describe("unicidad y concurrencia", () => {
  test("dos pedidos simultáneos con la misma clave: los dos reciben el mismo resultado y se registra UNA sola operación", async () => {
    const pedido = { operacion: "PREAUTORIZACION", monto: 5000, tarjeta: TARJETA, claveIdempotencia: "mismo" };
    const [a, b] = await Promise.all([procesar(pedido), procesar(pedido)]);
    expect(a).toEqual(b);
    expect(mockDoble.filas()).toHaveLength(1);
  });

  test("si la referencia al azar ya existe, se pide otra (no se pisa la anterior)", async () => {
    const crypto = require("node:crypto");
    jest.spyOn(crypto, "randomInt").mockReturnValueOnce(7).mockReturnValueOnce(7).mockReturnValue(8);
    const primera = await procesar({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: TARJETA });
    const segunda = await procesar({ operacion: "PREAUTORIZACION", monto: 1000, tarjeta: TARJETA });
    expect(primera.referencia).toBe("PRE-000007");
    expect(segunda.referencia).toBe("PRE-000008");
    expect(mockDoble.filas().map((f) => f.referencia)).toEqual(["PRE-000007", "PRE-000008"]);
  });

  test("captura y liberación simultáneas de la misma preautorización: gana una sola", async () => {
    const pre = await preautorizar(30000);
    const [cap, lib] = await Promise.all([
      procesar({ operacion: "CAPTURA", monto: 30000, referenciaPrevia: pre }),
      procesar({ operacion: "LIBERACION", monto: 30000, referenciaPrevia: pre }),
    ]);
    expect([cap.aprobado, lib.aprobado].filter(Boolean)).toHaveLength(1);
    expect([ESTADO.CAPTURADA, ESTADO.LIBERADA]).toContain(estadoDe(pre));
  });
});
