jest.mock("../../lib/prisma", () => ({}));
const { hoyComoFechaUTC } = require("../../lib/fechas");
const { validarAlta, firmaAlta, armarTitular, armarRespuestaAlta, VERSION_POLITICAS } = require("./ecommerce.alta");

function dia(desplazamiento) {
  const fecha = hoyComoFechaUTC();
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
}

const TARJETA = { titular: "MARIA GONZALEZ", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "987" };

function cuerpo({ huesped = {}, ...cambios } = {}) {
  return {
    claveIdempotencia: "6f1c2a9e-3b7d-4c55-9a51-2f0e8d7c1b44",
    fechaDesde: dia(10),
    fechaHasta: dia(12),
    planTarifarioId: 1,
    totalEsperado: 80000,
    habitaciones: [{ tipoHabitacionId: 1, adultos: 2, menores: 0 }],
    huesped: {
      nombres: "María José",
      apellido: "González",
      tipoDocumento: "dni",
      paisDocumento: "ar",
      numeroDocumento: "30111222",
      fechaNacimiento: "1990-05-20",
      email: "Maria@Correo.com",
      telefono: "+54 9 387 555-1234",
      nacionalidad: "AR",
      paisResidencia: "AR",
      ...huesped,
    },
    llegada: { horaEstimada: "18-20" },
    solicitudesEspeciales: "Cuna",
    consentimiento: { aceptaPoliticas: true, versionPoliticas: VERSION_POLITICAS, aceptaComunicaciones: false },
    ...cambios,
  };
}

function errorDe(fn) {
  try {
    fn();
  } catch (err) {
    return { status: err.status, codigo: err.codigo, campo: err.extra?.campo, motivo: err.extra?.motivo, mensaje: err.message };
  }
  throw new Error("No tiró error");
}

describe("validarAlta", () => {
  test("cuerpo válido: normaliza catálogos, email en minúsculas y devuelve solo lo guardable de la tarjeta", () => {
    const d = validarAlta(cuerpo(), TARJETA);
    expect(d.huesped).toMatchObject({ tipoDocumento: "DNI", paisDocumento: "AR", email: "maria@correo.com" });
    expect(d.tarjeta).toEqual({ titular: "MARIA GONZALEZ", vencimiento: "12/2099", ultimos4: "4242" });
    expect(JSON.stringify(d)).not.toMatch(/4242424242424242|"987"/);
  });

  test("nacionalidad y país de residencia son opcionales", () => {
    const d = validarAlta(cuerpo({ huesped: { nacionalidad: "", paisResidencia: undefined } }), TARJETA);
    expect(d.huesped).toMatchObject({ nacionalidad: null, paisResidencia: null });
  });

  test.each([
    ["clave con caracteres inválidos", { claveIdempotencia: "clave con espacios" }, "claveIdempotencia"],
    ["clave corta", { claveIdempotencia: "1234567" }, "claveIdempotencia"],
    ["entrada anterior a hoy", { fechaDesde: dia(-1) }, "fechaDesde"],
    ["4 líneas", { habitaciones: Array(4).fill({ tipoHabitacionId: 1, adultos: 1 }) }, "habitaciones"],
    ["totalEsperado 0", { totalEsperado: 0 }, "totalEsperado"],
    ["sin nombres", { huesped: { nombres: " " } }, "huesped.nombres"],
    ["apellido demasiado largo", { huesped: { apellido: "x".repeat(81) } }, "huesped.apellido"],
    ["tipo de documento fuera del catálogo", { huesped: { tipoDocumento: "Carnet" } }, "huesped.tipoDocumento"],
    ["país del documento inválido", { huesped: { paisDocumento: "XX" } }, "huesped.paisDocumento"],
    ["sin número de documento", { huesped: { numeroDocumento: "" } }, "huesped.numeroDocumento"],
    ["fecha de nacimiento inválida", { huesped: { fechaNacimiento: "1990-02-31" } }, "huesped.fechaNacimiento"],
    ["email inválido", { huesped: { email: "sin-arroba" } }, "huesped.email"],
    ["teléfono con letras", { huesped: { telefono: "abc12345" } }, "huesped.telefono"],
    ["teléfono corto", { huesped: { telefono: "12345" } }, "huesped.telefono"],
    ["nacionalidad inválida", { huesped: { nacionalidad: "Argentina" } }, "huesped.nacionalidad"],
    ["hora de llegada fuera de la lista", { llegada: { horaEstimada: "23-24" } }, "llegada.horaEstimada"],
    ["solicitudes de más de 500", { solicitudesEspeciales: "x".repeat(501) }, "solicitudesEspeciales"],
    ["sin aceptar políticas", { consentimiento: { aceptaPoliticas: false, versionPoliticas: VERSION_POLITICAS } }, "consentimiento.aceptaPoliticas"],
    ["versión de políticas vieja", { consentimiento: { aceptaPoliticas: true, versionPoliticas: "2025-01-01" } }, "consentimiento.aceptaPoliticas"],
    [
      "aceptaComunicaciones no booleano",
      { consentimiento: { aceptaPoliticas: true, versionPoliticas: VERSION_POLITICAS, aceptaComunicaciones: "sí" } },
      "consentimiento.aceptaComunicaciones",
    ],
  ])("%s → 400 DATOS_INVALIDOS", (_caso, cambios, campo) => {
    expect(errorDe(() => validarAlta(cuerpo(cambios), TARJETA))).toMatchObject({ status: 400, codigo: "DATOS_INVALIDOS", campo });
  });

  test("titular menor de 18 a la fecha de ingreso → 400 en huesped.fechaNacimiento", () => {
    const desde = new Date(`${dia(10)}T00:00:00Z`);
    const cumple18Despues = `${desde.getUTCFullYear() - 18}-${dia(11).slice(5)}`;
    expect(errorDe(() => validarAlta(cuerpo({ huesped: { fechaNacimiento: cumple18Despues } }), TARJETA))).toMatchObject({
      codigo: "DATOS_INVALIDOS",
      campo: "huesped.fechaNacimiento",
    });
  });

  test.each([
    ["sin titular", { titular: "" }, "tarjeta.titular"],
    ["número con letras", { numero: "4242abcd42424242" }, "tarjeta.numero"],
    ["número que no pasa Luhn", { numero: "4242424242424241" }, "tarjeta.numero"],
    ["mes 13", { vencimientoMes: 13 }, "tarjeta.vencimientoMes"],
    ["año de 2 dígitos", { vencimientoAnio: 30 }, "tarjeta.vencimientoAnio"],
    ["CVV de 2 dígitos", { cvv: "12" }, "tarjeta.cvv"],
  ])("tarjeta: %s → 400 en %s", (_caso, cambios, campo) => {
    const err = errorDe(() => validarAlta(cuerpo(), { ...TARJETA, ...cambios }));
    expect(err).toMatchObject({ status: 400, codigo: "DATOS_INVALIDOS", campo });
    expect(JSON.stringify(err)).not.toContain("4242424242424242");
  });

  describe("vencimiento de la tarjeta (vale hasta el último día de su mes)", () => {
    const salida = new Date(`${dia(40)}T00:00:00Z`);
    const mesSalida = salida.getUTCMonth() + 1;
    const anioSalida = salida.getUTCFullYear();
    const conSalida = (extra) => cuerpo({ fechaDesde: dia(38), fechaHasta: dia(40), ...extra });

    test("vence el mismo mes de la salida → aceptada", () => {
      expect(validarAlta(conSalida(), { ...TARJETA, vencimientoMes: mesSalida, vencimientoAnio: anioSalida }).tarjeta.vencimiento).toBe(
        `${String(mesSalida).padStart(2, "0")}/${anioSalida}`
      );
    });

    test("vence el mes anterior a la salida (y todavía no venció) → 422 TARJETA_VENCE_ANTES", () => {
      const mes = mesSalida === 1 ? 12 : mesSalida - 1;
      const anio = mesSalida === 1 ? anioSalida - 1 : anioSalida;
      const hoy = hoyComoFechaUTC();
      // Solo tiene sentido si ese mes no terminó todavía.
      if (new Date(Date.UTC(anio, mes, 0)) >= hoy) {
        expect(errorDe(() => validarAlta(conSalida(), { ...TARJETA, vencimientoMes: mes, vencimientoAnio: anio }))).toMatchObject({
          status: 422,
          codigo: "TARJETA_VENCE_ANTES",
        });
      }
    });

    test("ya vencida hoy → 402 PAGO_RECHAZADO 'Tarjeta vencida' (antes que el 422)", () => {
      const hoy = hoyComoFechaUTC();
      const pasado = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
      expect(
        errorDe(() => validarAlta(conSalida(), { ...TARJETA, vencimientoMes: pasado.getUTCMonth() + 1, vencimientoAnio: pasado.getUTCFullYear() }))
      ).toMatchObject({ status: 402, codigo: "PAGO_RECHAZADO", motivo: "Tarjeta vencida" });
    });
  });
});

describe("firmaAlta (mismos datos)", () => {
  const base = { fechaDesde: "2026-10-16", fechaHasta: "2026-10-18", planTarifarioId: 1, identidad: "abc" };
  test("las líneas son un multiconjunto: el orden no importa", () => {
    const a = firmaAlta({ ...base, lineas: [{ tipoHabitacionId: 1, adultos: 2, menores: 0 }, { tipoHabitacionId: 2, adultos: 1, menores: 0 }] });
    const b = firmaAlta({ ...base, lineas: [{ tipoHabitacionId: 2, adultos: 1, menores: 0 }, { tipoHabitacionId: 1, adultos: 2, menores: 0 }] });
    expect(a).toBe(b);
  });
  test("otras fechas, otro plan, otra ocupación u otro titular → distinta", () => {
    const lineas = [{ tipoHabitacionId: 1, adultos: 2, menores: 0 }];
    const firma = firmaAlta({ ...base, lineas });
    expect(firmaAlta({ ...base, lineas, fechaHasta: "2026-10-19" })).not.toBe(firma);
    expect(firmaAlta({ ...base, lineas, planTarifarioId: 2 })).not.toBe(firma);
    expect(firmaAlta({ ...base, lineas: [{ tipoHabitacionId: 1, adultos: 2, menores: 1 }] })).not.toBe(firma);
    expect(firmaAlta({ ...base, lineas, identidad: "otra" })).not.toBe(firma);
  });
});

describe("armarTitular (la web no pisa la ficha)", () => {
  const web = {
    nombres: "Otra",
    apellido: "Persona",
    tipoDocumento: "DNI",
    paisDocumento: "AR",
    numeroDocumento: "30111222",
    fechaNacimiento: "1980-01-01",
    email: "nuevo@correo.com",
    telefono: "+54 9 387 555-0000",
    nacionalidad: "CL",
    paisResidencia: "CL",
  };

  test("sin ficha: los datos de la web, con contacto = email, y la residencia declarada", () => {
    expect(armarTitular(web, null)).toEqual({
      huesped: {
        nombres: "Otra",
        apellido: "Persona",
        tipoDocumento: "DNI",
        paisDocumento: "AR",
        numeroDocumento: "30111222",
        fechaNacimiento: "1980-01-01",
        contacto: "nuevo@correo.com",
      },
      residencia: { nacionalidad: "CL", paisResidencia: "CL" },
      avisoContacto: null,
    });
  });

  test("con ficha completa: todo sale de la ficha y la residencia no se toca", () => {
    const ficha = {
      id: 7,
      nombre: "Lucía Fernández",
      nombres: "Lucía",
      apellido: "Fernández",
      tipoDocumento: "DNI",
      paisDocumento: "AR",
      numeroDocumento: "30111222",
      fechaNacimiento: new Date("1991-10-01T00:00:00Z"),
      contacto: "lucia@correo.com",
      preferencias: "Piso alto",
      nacionalidad: "AR",
      paisResidencia: "AR",
    };
    expect(armarTitular(web, ficha)).toEqual({
      huesped: {
        nombres: "Lucía",
        apellido: "Fernández",
        tipoDocumento: "DNI",
        paisDocumento: "AR",
        numeroDocumento: "30111222",
        fechaNacimiento: "1991-10-01",
        contacto: "lucia@correo.com",
        preferencias: "Piso alto",
      },
      residencia: {},
      avisoContacto: null,
    });
  });

  test("con ficha incompleta: la web completa solo lo vacío (nacimiento, contacto, residencia)", () => {
    const ficha = {
      id: 8,
      nombre: "Lucía Fernández",
      nombres: "Lucía",
      apellido: "Fernández",
      tipoDocumento: "DNI",
      paisDocumento: "AR",
      numeroDocumento: "30111222",
      fechaNacimiento: null,
      contacto: null,
      preferencias: null,
      nacionalidad: "AR",
      paisResidencia: null,
    };
    const { huesped, residencia } = armarTitular(web, ficha);
    expect(huesped).toMatchObject({ nombres: "Lucía", fechaNacimiento: "1980-01-01", contacto: "nuevo@correo.com" });
    expect(residencia).toEqual({ paisResidencia: "CL" });
  });

  test("ficha vieja sin nombres y apellido separados: manda su nombre y no los completa", () => {
    const ficha = { id: 9, nombre: "Juan Pérez", nombres: null, apellido: null, tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "1", fechaNacimiento: null, contacto: "+54 387 555-0101" };
    const { huesped } = armarTitular(web, ficha);
    expect(huesped.nombre).toBe("Juan Pérez");
    expect(huesped).not.toHaveProperty("nombres");
    expect(huesped).not.toHaveProperty("apellido");
    expect(huesped.contacto).toBe("+54 387 555-0101");
  });

  test("contacto de la ficha que no es email ni teléfono: se reemplaza por el email, con aviso sin datos personales", () => {
    const ficha = { id: 10, nombre: "Ana", nombres: "Ana", apellido: "Gómez", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "2", contacto: "llamar a recepción" };
    const { huesped, avisoContacto } = armarTitular(web, ficha);
    expect(huesped.contacto).toBe("nuevo@correo.com");
    expect(avisoContacto).toMatch(/no es un email ni un teléfono/);
    expect(avisoContacto).not.toMatch(/llamar|nuevo@correo/);
  });
});

describe("armarRespuestaAlta", () => {
  const reserva = (reembolsable, pagos = []) => ({
    codigoConfirmacion: "3FA9C21B",
    estado: "Confirmada",
    fechaDesde: new Date("2026-10-16T00:00:00Z"),
    fechaHasta: new Date("2026-10-18T00:00:00Z"),
    planTarifario: { codigo: reembolsable ? "BAR" : "NRF", nombre: "x", reembolsable, horasCancelacionSinCargo: reembolsable ? 48 : null },
    reservaHabitaciones: [
      { id: 2, adultos: 2, menores: 1, habitacion: { tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble" } }, reservaNoches: [{ precioNoche: "40000.50" }, { precioNoche: "40000.25" }] },
    ],
    pagosEstadia: pagos,
    // La garantía sale de GarantiaReserva (una sola fuente, también para la web).
    garantiaReserva: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242", estado: reembolsable ? "Vigente" : "Capturada" },
  });

  test("reembolsable: GARANTIA y cobradoAhora 0, sin ids ni números de habitación", () => {
    const r = armarRespuestaAlta(reserva(true), { enviado: true });
    expect(r).toEqual({
      codigoConfirmacion: "3FA9C21B",
      estado: "Confirmada",
      fechaDesde: "2026-10-16",
      fechaHasta: "2026-10-18",
      noches: 2,
      plan: { codigo: "BAR", nombre: "x", reembolsable: true, horasCancelacionSinCargo: 48 },
      total: 80000.75,
      cobradoAhora: 0,
      garantia: { tipo: "GARANTIA", marca: "Visa", ultimos4: "4242" },
      habitaciones: [{ tipo: "Doble", adultos: 2, menores: 1 }],
      email: { enviado: true },
    });
  });

  test("no reembolsable: PREPAGO y cobradoAhora = lo cobrado (sin pagos anulados)", () => {
    const pagos = [
      { anulado: false, medios: [{ importe: "80000.75" }] },
      { anulado: true, medios: [{ importe: "999" }] },
    ];
    const r = armarRespuestaAlta(reserva(false, pagos), { enviado: null });
    expect(r).toMatchObject({ cobradoAhora: 80000.75, garantia: { tipo: "PREPAGO", marca: "Visa", ultimos4: "4242" }, email: { enviado: null } });
  });
});
