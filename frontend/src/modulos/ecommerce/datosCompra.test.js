import { describe, expect, it } from "vitest";
import {
  datosListosParaPago,
  formatearNumeroTarjeta,
  formatearVencimiento,
  leerVencimiento,
  marcaTarjeta,
  pasaLuhn,
  rutaResultados,
  tarjetaParaEnviar,
  textoTarjeta,
  ubicarCampoServidor,
  validarHuesped,
  validarSolicitudes,
  validarTarjeta,
} from "./datosCompra";

const HUESPED = {
  nombres: "María José",
  apellido: "González",
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "30111222",
  fechaNacimiento: "1990-05-20",
  email: "maria@correo.com",
  telefono: "+54 9 387 555-1234",
  nacionalidad: "",
  paisResidencia: "",
};
const CONTEXTO = { fechaDesde: "2026-11-20", hoy: "2026-10-05" };

describe("validarHuesped", () => {
  it("un titular completo no tiene errores (nacionalidad y residencia son opcionales)", () => {
    expect(validarHuesped(HUESPED, CONTEXTO)).toEqual({});
    expect(validarHuesped({ ...HUESPED, nacionalidad: "BR", paisResidencia: "ar" }, CONTEXTO)).toEqual({});
  });

  it("marca cada obligatorio vacío", () => {
    const errores = validarHuesped({ tipoDocumento: "DNI", paisDocumento: "AR" }, CONTEXTO);
    expect(Object.keys(errores).sort()).toEqual(["apellido", "email", "fechaNacimiento", "nombres", "numeroDocumento", "telefono"]);
  });

  it("nombres y apellido hasta 80 caracteres", () => {
    expect(validarHuesped({ ...HUESPED, nombres: "a".repeat(81) }, CONTEXTO).nombres).toMatch(/80/);
    expect(validarHuesped({ ...HUESPED, apellido: "a".repeat(80) }, CONTEXTO)).toEqual({});
  });

  it("tipo y país del documento de los catálogos", () => {
    expect(validarHuesped({ ...HUESPED, tipoDocumento: "Carnet" }, CONTEXTO).tipoDocumento).toBeTruthy();
    expect(validarHuesped({ ...HUESPED, paisDocumento: "" }, CONTEXTO).paisDocumento).toBeTruthy();
    expect(validarHuesped({ ...HUESPED, paisDocumento: "XX" }, CONTEXTO).paisDocumento).toBeTruthy();
    expect(validarHuesped({ ...HUESPED, nacionalidad: "Narnia" }, CONTEXTO).nacionalidad).toMatch(/lista/);
  });

  it("mayor de 18 a la fecha de INGRESO (no a hoy)", () => {
    // Cumple 18 el 2026-11-20: justo el día de ingreso → válido.
    expect(validarHuesped({ ...HUESPED, fechaNacimiento: "2008-11-20" }, CONTEXTO)).toEqual({});
    expect(validarHuesped({ ...HUESPED, fechaNacimiento: "2008-11-21" }, CONTEXTO).fechaNacimiento).toMatch(/18 años/);
  });

  it("fecha de nacimiento inválida o futura", () => {
    expect(validarHuesped({ ...HUESPED, fechaNacimiento: "1990-02-30" }, CONTEXTO).fechaNacimiento).toMatch(/no es válida/);
    expect(validarHuesped({ ...HUESPED, fechaNacimiento: "2026-12-01" }, CONTEXTO).fechaNacimiento).toMatch(/no es válida/);
  });

  it("email y teléfono con el formato del backend", () => {
    expect(validarHuesped({ ...HUESPED, email: "maria@correo" }, CONTEXTO).email).toMatch(/válido/);
    expect(validarHuesped({ ...HUESPED, telefono: "123" }, CONTEXTO).telefono).toBeTruthy();
    expect(validarHuesped({ ...HUESPED, telefono: "387-abc-1234" }, CONTEXTO).telefono).toBeTruthy();
    expect(validarHuesped({ ...HUESPED, telefono: "+++----" }, CONTEXTO).telefono).toBeTruthy();
    expect(validarHuesped({ ...HUESPED, telefono: "(0387) 421-0000" }, CONTEXTO)).toEqual({});
  });
});

describe("datosListosParaPago y solicitudes", () => {
  it("exige titular válido y términos aceptados", () => {
    const base = { huesped: HUESPED, solicitudesEspeciales: "", ...CONTEXTO };
    expect(datosListosParaPago({ ...base, consentimiento: { aceptaPoliticas: true } })).toBe(true);
    expect(datosListosParaPago({ ...base, consentimiento: { aceptaPoliticas: false } })).toBe(false);
    expect(datosListosParaPago({ ...base, huesped: { ...HUESPED, email: "" }, consentimiento: { aceptaPoliticas: true } })).toBe(false);
  });

  it("solicitudes hasta 500 caracteres", () => {
    expect(validarSolicitudes("a".repeat(500))).toBeNull();
    expect(validarSolicitudes("a".repeat(501))).toMatch(/500/);
  });
});

describe("tarjeta", () => {
  it("Luhn y marca por prefijo (como la pasarela simulada)", () => {
    expect(pasaLuhn("4242 4242 4242 4242")).toBe(true);
    expect(pasaLuhn("4242424242424241")).toBe(false);
    expect(marcaTarjeta("4242")).toBe("VISA");
    expect(marcaTarjeta("5555555555554444")).toBe("MASTERCARD");
    expect(marcaTarjeta("2221000000000009")).toBe("MASTERCARD");
    expect(marcaTarjeta("378282246310005")).toBe("AMEX");
    expect(marcaTarjeta("6011111111111117")).toBeNull();
  });

  it("formatea el número y el vencimiento mientras se tipea", () => {
    expect(formatearNumeroTarjeta("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatearNumeroTarjeta("3782-822463-10005")).toBe("3782 822463 10005");
    expect(formatearVencimiento("1")).toBe("1");
    expect(formatearVencimiento("4")).toBe("04/");
    expect(formatearVencimiento("123")).toBe("12/3");
    expect(formatearVencimiento("12/", "12/3")).toBe("12/");
    expect(formatearVencimiento("12", "12/")).toBe("12");
    expect(leerVencimiento("08/29")).toEqual({ mes: 8, anio: 2029 });
    expect(leerVencimiento("13/29")).toBeNull();
  });

  const OK = { titular: "MARIA GONZALEZ", numero: "4242 4242 4242 4242", vencimiento: "12/30", cvv: "123" };
  const FECHAS = { hoy: "2026-10-05", fechaHasta: "2026-11-23" };

  it("una tarjeta válida no tiene errores y se envía con la forma del contrato", () => {
    expect(validarTarjeta(OK, FECHAS)).toEqual({});
    expect(tarjetaParaEnviar(OK)).toEqual({ titular: "MARIA GONZALEZ", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" });
  });

  it("número sin Luhn, CVV según la marca y titular obligatorio", () => {
    expect(validarTarjeta({ ...OK, numero: "4242 4242 4242 4241" }, FECHAS).numero).toBeTruthy();
    expect(validarTarjeta({ ...OK, cvv: "1234" }, FECHAS).cvv).toMatch(/3 dígitos/);
    expect(validarTarjeta({ ...OK, numero: "378282246310005", cvv: "123" }, FECHAS).cvv).toMatch(/4 dígitos/);
    expect(validarTarjeta({ ...OK, titular: " " }, FECHAS).titular).toBeTruthy();
  });

  it("vencida, vence antes de la salida, o el mismo mes de la salida (vale)", () => {
    expect(validarTarjeta({ ...OK, vencimiento: "09/26" }, FECHAS).vencimiento).toMatch(/vencida/);
    expect(validarTarjeta({ ...OK, vencimiento: "10/26" }, FECHAS).vencimiento).toMatch(/antes de tu fecha de salida/);
    expect(validarTarjeta({ ...OK, vencimiento: "11/26" }, FECHAS)).toEqual({});
  });

  it("texto de la tarjeta para la confirmación", () => {
    expect(textoTarjeta({ marca: "VISA", ultimos4: "4242" })).toBe("tarjeta Visa terminada en 4242");
    expect(textoTarjeta({ marca: "OTRA", ultimos4: "1117" })).toBe("tarjeta terminada en 1117");
  });
});

describe("ubicarCampoServidor y rutaResultados", () => {
  it("lleva cada `campo` de DATOS_INVALIDOS a su paso", () => {
    expect(ubicarCampoServidor("tarjeta.numero")).toEqual({ paso: "pago", campo: "numero" });
    expect(ubicarCampoServidor("tarjeta.vencimientoAnio")).toEqual({ paso: "pago", campo: "vencimiento" });
    expect(ubicarCampoServidor("huesped.email")).toEqual({ paso: "datos", campo: "email" });
    expect(ubicarCampoServidor("consentimiento.aceptaPoliticas")).toEqual({ paso: "datos", campo: "consentimiento" });
    expect(ubicarCampoServidor("llegada.horaEstimada")).toEqual({ paso: "datos", campo: "llegada" });
    expect(ubicarCampoServidor("fechaHasta")).toBeNull();
  });

  it("vuelve a resultados con la búsqueda", () => {
    expect(rutaResultados({ fechaDesde: "2026-11-20", fechaHasta: "2026-11-23", ocupacion: [{ adultos: 2, menores: 1 }] })).toBe(
      "/web/resultados?entrada=2026-11-20&salida=2026-11-23&adultos=2&menores=1"
    );
    expect(rutaResultados({})).toBe("/web/resultados");
  });
});
