jest.mock("../../lib/correo", () => ({ enviarCorreo: jest.fn() }));
const { enviarCorreo } = require("../../lib/correo");
const { armarEmail, enviarConfirmacion, armarEmailCancelacion, enviarCancelacion, textoMiReserva } = require("./emailWeb.servicio");

const reserva = (reembolsable) => ({
  codigoConfirmacion: "3FA9C21B",
  fechaDesde: "2026-10-16",
  fechaHasta: "2026-10-18",
  noches: 2,
  plan: { codigo: reembolsable ? "BAR" : "NRF", nombre: "Best Available Rate", reembolsable, horasCancelacionSinCargo: reembolsable ? 48 : null },
  total: 80000,
  cobradoAhora: reembolsable ? 0 : 80000,
  garantia: { tipo: reembolsable ? "GARANTIA" : "PREPAGO", marca: "VISA", ultimos4: "4242" },
  habitaciones: [{ tipo: "Doble <b>", adultos: 2, menores: 1 }],
});

beforeEach(() => enviarCorreo.mockReset());

test("tarifa flexible: código, fechas, noches, habitación sin número, nombre comercial, total y garantía sin cobro", () => {
  const { asunto, texto, html } = armarEmail(reserva(true));
  expect(asunto).toBe("Reserva confirmada · 3FA9C21B");
  for (const parte of [
    "3FA9C21B",
    "16 de octubre de 2026",
    "18 de octubre de 2026",
    "2 noches",
    "Habitación Doble <b> · 2 adultos y 1 menor",
    "Tarifa flexible · Cancelación sin cargo hasta el miércoles 14/10/2026 a las 14:00",
    "Garantizada con tarjeta Visa terminada en 4242, no se cobró nada.",
    "check-in desde las 14 h",
    "Mi reserva",
  ]) {
    expect(texto).toContain(parte);
  }
  expect(texto).not.toContain("Best Available Rate");
  // HTML escapado.
  expect(html).toContain("Doble &lt;b&gt;");
  expect(html).not.toContain("Doble <b>");
});

test("no reembolsable: dice lo cobrado con los últimos 4", () => {
  const { texto } = armarEmail(reserva(false));
  expect(texto).toContain("No reembolsable · Se cobra el total al reservar");
  expect(texto).toMatch(/Cobrado \$\s?80\.000 con tarjeta Visa terminada en 4242\./);
  expect(texto).toContain("Estado: Pagada");
  expect(texto).toContain("no admite cancelación con devolución");
});

describe("correcciones del email (fecha exacta, no reembolsable, contacto y datos personales)", () => {
  const { HOTEL } = require("./ecommerce.hotel");
  const anterior = process.env.WEB_PUBLIC_URL;
  afterEach(() => {
    if (anterior === undefined) delete process.env.WEB_PUBLIC_URL;
    else process.env.WEB_PUBLIC_URL = anterior;
  });

  test("tarifa flexible: fecha y hora exactas del límite y el cargo posterior (texto y HTML)", () => {
    const { texto, html } = armarEmail(reserva(true), { penalidadNoShow: "PRIMERA_NOCHE" });
    expect(texto).toContain("Cancelación sin cargo hasta el miércoles 14/10/2026 a las 14:00");
    expect(texto).toContain("Después de esa fecha, la cancelación tiene un cargo de la primera noche.");
    expect(texto).not.toMatch(/48 h antes/);
    expect(html).toContain("hasta el miércoles 14/10/2026 a las 14:00");
    expect(html).toContain("Después de esa fecha, la cancelación tiene un cargo de la primera noche.");
  });

  test("no reembolsable: no se reintegra, sin 'cancelá', y el link solo consulta", () => {
    delete process.env.WEB_PUBLIC_URL;
    const sinUrl = armarEmail(reserva(false), { penalidadNoShow: "TOTAL_ESTADIA" });
    expect(sinUrl.texto).toContain("Si no te presentás, no se reintegra el importe pagado.");
    expect(sinUrl.texto).not.toMatch(/se cobra el total de la estadía|cancelá|Después de esa fecha/);
    expect(sinUrl.texto).toContain("Consultá tu reserva en nuestra web con tu código y tu email.");
    process.env.WEB_PUBLIC_URL = "https://hotel.example.com";
    const conUrl = armarEmail(reserva(false), { penalidadNoShow: "TOTAL_ESTADIA" });
    expect(conUrl.texto).toContain("Consultá tu reserva en https://hotel.example.com/web/mi-reserva?codigo=3FA9C21B");
    expect(conUrl.texto + conUrl.html).not.toMatch(/cancelá/);
  });

  test("'Antes de llegar' con DNI o pasaporte de cada persona y la regla de menores", () => {
    for (const r of [reserva(true), reserva(false)]) {
      const { texto, html } = armarEmail(r);
      for (const parte of [
        "Traé el DNI o pasaporte de cada persona que se aloja: registramos a todos los huéspedes en el check-in.",
        "Los menores de 18 años se alojan con un adulto responsable; si viajan sin sus padres, traé la autorización correspondiente.",
        "El check-in es desde las 14 h. Tu habitación está garantizada aunque llegues tarde.",
        "Guardá este código: lo necesitás para consultar o cancelar tu reserva.",
      ]) {
        expect(texto).toContain(parte);
        expect(html).toContain(parte);
      }
      expect(texto).not.toContain("el documento que declaraste");
    }
  });

  test("contacto del hotel, pie y aviso de datos personales (Ley 25.326) en confirmación y cancelación", () => {
    const cancelada = { ...reserva(true), estado: "Cancelada" };
    for (const { texto, html } of [armarEmail(reserva(true)), armarEmail(reserva(false)), armarEmailCancelacion(cancelada)]) {
      for (const parte of [
        `Usamos tus datos solo para gestionar tu reserva. Para consultarlos, corregirlos o pedir que los eliminemos, escribinos a ${HOTEL.email} (Ley 25.326).`,
        `${HOTEL.nombre} · ${HOTEL.direccion} · ${HOTEL.telefono} · ${HOTEL.email}`,
      ]) {
        expect(texto).toContain(parte);
        expect(html).toContain(parte);
      }
    }
    expect(armarEmail(reserva(false)).texto).toContain(`contactá a recepción (${HOTEL.telefono} · ${HOTEL.email})`);
    expect(armarEmailCancelacion(cancelada).texto).toContain(`contactá a recepción (${HOTEL.telefono} · ${HOTEL.email})`);
  });

  test("el límite del email coincide con el limiteSinCargo de calcularPenalidad", async () => {
    jest.resetModules();
    jest.doMock("../../lib/prisma", () => ({}));
    const { calcularPenalidad } = require("../tarifas/penalidades.servicio");
    const { formatearInstanteArgentina } = require("../../lib/fechas");
    for (const [fechaDesde, horas] of [["2026-10-16", 48], ["2026-11-15", 24], ["2026-12-31", 72], ["2027-01-01", 0]]) {
      const cliente = {
        reserva: {
          findUnique: async () => ({
            id: 1,
            estado: "Confirmada",
            fechaDesde: new Date(`${fechaDesde}T00:00:00.000Z`),
            planTarifario: { reembolsable: true, horasCancelacionSinCargo: horas, penalidadNoShow: "PRIMERA_NOCHE" },
            reservaHabitaciones: [],
          }),
        },
      };
      const { limiteSinCargo } = await calcularPenalidad({ reservaId: 1, tipo: "CANCELACION", momento: new Date("2020-01-01") }, cliente);
      const { armarEmail: armar } = require("./emailWeb.servicio");
      const r = { ...reserva(true), fechaDesde, plan: { ...reserva(true).plan, horasCancelacionSinCargo: horas } };
      expect(armar(r).texto).toContain(`hasta el ${formatearInstanteArgentina(limiteSinCargo)}`);
    }
    jest.dontMock("../../lib/prisma");
  });
});

test("envía al email de contacto y devuelve enviado: true", async () => {
  enviarCorreo.mockResolvedValue({ enviado: true, messageId: "x" });
  await expect(enviarConfirmacion(reserva(true), "huesped@correo.com")).resolves.toEqual({ enviado: true });
  expect(enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ para: "huesped@correo.com", asunto: "Reserva confirmada · 3FA9C21B" }));
});

test("SMTP caído o sin configurar → enviado: false, sin tirar", async () => {
  enviarCorreo.mockResolvedValue({ enviado: false, motivo: "SMTP no configurado" });
  await expect(enviarConfirmacion(reserva(true), "huesped@correo.com")).resolves.toEqual({ enviado: false });
  const espia = jest.spyOn(console, "error").mockImplementation(() => {});
  enviarCorreo.mockRejectedValue(new Error("boom"));
  await expect(enviarConfirmacion(reserva(true), "huesped@correo.com")).resolves.toEqual({ enviado: false });
  espia.mockRestore();
});

describe("email definitivo: datos del alta que no vienen en la respuesta", () => {
  const extra = {
    nombre: "María <José>",
    horaEstimadaLlegada: "20-22",
    solicitudesEspeciales: "Cuna <script>alert(1)</script>",
    penalidadNoShow: "PRIMERA_NOCHE",
  };

  test("saludo, llegada estimada, solicitudes, no-show, check-out y estado (todo escapado en el HTML)", () => {
    const { texto, html } = armarEmail(reserva(true), extra);
    for (const parte of [
      "Hola, María <José>:",
      "Estado: Confirmada · garantizada con tarjeta",
      "check-out hasta las 11 h",
      "Llegada estimada: entre las 20 y las 22 h",
      "Solicitudes especiales: Cuna <script>alert(1)</script>",
      "Si no te presentás, se cobra la primera noche.",
      "Podés cancelar sin cargo hasta el miércoles 14/10/2026 a las 14:00 desde Mi reserva, con tu código y tu email.",
      "Traé el DNI o pasaporte de cada persona que se aloja",
    ]) {
      expect(texto).toContain(parte);
    }
    expect(html).toContain("Hola, María &lt;José&gt;");
    expect(html).toContain("Cuna &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/<script|María <José>/);
    expect(html).toContain("viernes 16 de octubre de 2026");
    expect(html).toMatch(/^<!doctype html>/);
  });

  test("sin datos extra (o 'No lo sé todavía'): sin llegada ni solicitudes, saludo genérico", () => {
    const { texto } = armarEmail(reserva(true), { horaEstimadaLlegada: "NO_SABE", solicitudesEspeciales: "   " });
    expect(texto.startsWith("Hola:")).toBe(true);
    expect(texto).not.toMatch(/Llegada estimada|Solicitudes especiales|Si no te presentás/);
  });

  test("marca desconocida: 'tarjeta terminada en …' y nunca el número completo", () => {
    const r = { ...reserva(false), garantia: { tipo: "PREPAGO", marca: "OTRA", ultimos4: "1117" } };
    const { texto, html } = armarEmail(r);
    expect(texto).toContain("con tarjeta terminada en 1117.");
    expect(texto + html).not.toMatch(/\d{12,}/);
  });

  test("enviarConfirmacion pasa los datos extra al armado", async () => {
    enviarCorreo.mockResolvedValue({ enviado: true });
    await enviarConfirmacion(reserva(true), "huesped@correo.com", extra);
    expect(enviarCorreo.mock.calls[0][0].texto).toContain("Llegada estimada: entre las 20 y las 22 h");
  });
});

describe("link a Mi reserva (WEB_PUBLIC_URL)", () => {
  const anterior = process.env.WEB_PUBLIC_URL;
  afterEach(() => {
    if (anterior === undefined) delete process.env.WEB_PUBLIC_URL;
    else process.env.WEB_PUBLIC_URL = anterior;
  });

  test("con la URL: link con el código y sin el email", () => {
    process.env.WEB_PUBLIC_URL = "https://hotel.example.com/";
    const { texto, html } = armarEmail(reserva(true));
    expect(texto).toContain("Consultá o cancelá tu reserva en https://hotel.example.com/web/mi-reserva?codigo=3FA9C21B");
    expect(html).toContain('<a href="https://hotel.example.com/web/mi-reserva?codigo=3FA9C21B"');
    expect(html).toContain("Ver mi reserva</a>");
    expect(texto + html).not.toMatch(/email=|huesped@correo/);
  });

  test("sin la URL (o con un valor que no es http/https): texto de cómo llegar, sin link", () => {
    delete process.env.WEB_PUBLIC_URL;
    expect(armarEmail(reserva(true)).texto).toContain("Ingresá a Mi reserva en nuestra web con tu código y tu email.");
    expect(armarEmail(reserva(true)).html).not.toContain("<a ");
    process.env.WEB_PUBLIC_URL = "javascript:alert(1)";
    expect(textoMiReserva("3FA9C21B")).toEqual({ texto: "Ingresá a Mi reserva en nuestra web con tu código y tu email.", url: null });
  });
});

describe("email de cancelación", () => {
  const cancelada = {
    codigoConfirmacion: "3FA9C21B",
    estado: "Cancelada",
    fechaDesde: "2026-10-16",
    fechaHasta: "2026-10-18",
    noches: 2,
    plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48 },
    habitaciones: [{ tipo: "Doble <b>", adultos: 2, menores: 0 }],
  };

  test("asunto, fechas, tipo, plan comercial y sin cargo; HTML escapado", () => {
    const { asunto, texto, html } = armarEmailCancelacion(cancelada);
    expect(asunto).toBe("Tu reserva 3FA9C21B fue cancelada");
    for (const parte of ["16 de octubre de 2026", "18 de octubre de 2026", "2 noches", "Habitación Doble <b> · 2 adultos", "Tarifa flexible", "No se realizó ningún cargo."]) {
      expect(texto).toContain(parte);
    }
    expect(texto).not.toContain("Best Available Rate");
    expect(html).toContain("Doble &lt;b&gt;");
  });

  test("envía al email indicado; sin destinatario o con SMTP caído → enviado: false sin tirar", async () => {
    enviarCorreo.mockResolvedValue({ enviado: true });
    await expect(enviarCancelacion(cancelada, "juan@correo.com")).resolves.toEqual({ enviado: true });
    expect(enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ para: "juan@correo.com", asunto: "Tu reserva 3FA9C21B fue cancelada" }));
    await expect(enviarCancelacion(cancelada, null)).resolves.toEqual({ enviado: false });
    const espia = jest.spyOn(console, "error").mockImplementation(() => {});
    enviarCorreo.mockRejectedValue(new Error("boom"));
    await expect(enviarCancelacion(cancelada, "juan@correo.com")).resolves.toEqual({ enviado: false });
    espia.mockRestore();
  });
});

describe("email de cancelación con cargo (F6)", () => {
  const { armarEmailCancelacion, textoCargoCancelacion } = require("./emailWeb.servicio");
  const cancelada = {
    codigoConfirmacion: "3FA9C21B",
    estado: "Cancelada",
    fechaDesde: "2026-10-16",
    fechaHasta: "2026-10-18",
    noches: 2,
    plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48 },
    habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }],
  };

  test.each([
    [null, "No se realizó ningún cargo."],
    [{ estado: "SIN_CARGO", monto: 0 }, "No se realizó ningún cargo."],
    [{ estado: "COBRADO", monto: 25000, tarjeta: { marca: "VISA", ultimos4: "4242" } }, "Se cobró $ 25.000 con tu tarjeta Visa terminada en 4242 (cargo por cancelación)."],
    [{ estado: "RETENIDO", monto: 63750 }, "No se reintegra el importe pagado ($ 63.750)."],
    [{ estado: "PENDIENTE", monto: 25000 }, "El cargo de $ 25.000 quedó pendiente; recepción se va a comunicar con vos."],
  ])("%j → %s", (cargo, esperado) => {
    expect(textoCargoCancelacion(cargo)).toBe(esperado);
    const { texto, html } = armarEmailCancelacion(cancelada, cargo);
    expect(texto).toContain(esperado);
    expect(html).toContain(esperado);
  });

  test("con cargo, el email no dice 'sin cargo'", () => {
    const { html } = armarEmailCancelacion(cancelada, { estado: "COBRADO", monto: 25000, tarjeta: { marca: "VISA", ultimos4: "4242" } });
    expect(html).not.toContain("No se realizó ningún cargo");
    expect(html).not.toContain("fue cancelada sin cargo");
  });
});
