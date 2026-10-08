jest.mock("../../lib/prisma", () => ({}));
const reservasServicio = require("../reservas/reservas.servicio");
const cotizacionServicio = require("../tarifas/cotizacion.servicio");
const {
  CODIGO,
  MENSAJE_GENERICO,
  ErrorWeb,
  esMensajeSeguro,
  mensajeSeguro,
  traducirError,
  responderError,
} = require("./ecommerce.errores");

function resFalsa() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
}

describe("mensajeSeguro", () => {
  test("un motivo de estadía mínima pasa tal cual, aunque diga 'reserva' o 'habitación'", () => {
    expect(mensajeSeguro("La estadía mínima para esta reserva es de 3 noches", "gen")).toBe(
      "La estadía mínima para esta reserva es de 3 noches"
    );
    expect(esMensajeSeguro('La temporada "Alta" exige una estadía mínima de 3 noches.')).toBe(true);
    expect(esMensajeSeguro("El tipo de habitación indicado está dado de baja.")).toBe(true);
  });

  test("un número de habitación concreto no pasa", () => {
    expect(mensajeSeguro("La ocupación de la habitación 204 (5) supera su capacidad (4).", "gen")).toBe("gen");
    expect(esMensajeSeguro("No hay disponibilidad en hab. 050")).toBe(false);
    expect(esMensajeSeguro("Habitación 12 dada de baja")).toBe(false);
  });

  test("un código de reserva (8 hexadecimales) no pasa", () => {
    expect(mensajeSeguro("Choca con la reserva 3FA9C21B del 12/10", "gen")).toBe("gen");
  });

  test("vacío o ausente → genérico", () => {
    expect(mensajeSeguro("", "gen")).toBe("gen");
    expect(mensajeSeguro(null, "gen")).toBe("gen");
  });
});

describe("traducirError", () => {
  test("un ErrorWeb se devuelve igual", () => {
    const err = new ErrorWeb(409, CODIGO.SIN_DISPONIBILIDAD);
    expect(traducirError(err)).toBe(err);
    expect(err.message).toBe(MENSAJE_GENERICO[CODIGO.SIN_DISPONIBILIDAD]);
  });

  test("un 409 del motor con mensaje seguro se informa con ese mensaje (no SIN_DISPONIBILIDAD)", () => {
    const err = new cotizacionServicio.ErrorDeNegocio("No se aceptan llegadas en esta fecha.", 409);
    const web = traducirError(err, { origen: "cotizar" });
    expect(web.codigo).toBe(CODIGO.DATOS_INVALIDOS);
    expect(web.message).toBe("No se aceptan llegadas en esta fecha.");
  });

  test("un error de negocio con un dato de otra persona sale con el genérico", () => {
    const err = new reservasServicio.ErrorDeNegocio("No hay disponibilidad en: 204 (reserva 3FA9C21B)", 409);
    const web = traducirError(err);
    expect(web.message).toBe(MENSAJE_GENERICO[CODIGO.DATOS_INVALIDOS]);
    expect(web.message).not.toMatch(/204|3FA9C21B/);
  });

  test("un error inesperado no se traduce", () => {
    expect(traducirError(new TypeError("x is undefined"))).toBeNull();
  });
});

describe("responderError", () => {
  test("ErrorWeb → su status, con { error, codigo, ...extra }", () => {
    const res = resFalsa();
    responderError(res, new ErrorWeb(400, CODIGO.DATOS_INVALIDOS, "Mal", { campo: "adultos" }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Mal", codigo: "DATOS_INVALIDOS", campo: "adultos" });
  });

  test("error inesperado → 500 ERROR_INTERNO, logueado con mensaje y stack, sin el body", () => {
    const res = resFalsa();
    const espia = jest.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("se rompió");
    responderError(res, err);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: MENSAJE_GENERICO.ERROR_INTERNO, codigo: "ERROR_INTERNO" });
    expect(espia).toHaveBeenCalledWith("[ecommerce] Error inesperado:", "se rompió", err.stack);
    espia.mockRestore();
  });
});
