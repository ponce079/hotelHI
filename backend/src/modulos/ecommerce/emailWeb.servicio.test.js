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
    "Tarifa flexible · Cancelación sin cargo hasta 48 h antes de la llegada",
    "Garantizada con tarjeta terminada en 4242, no se cobró nada.",
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
  expect(texto).toMatch(/Cobrado \$\s?80\.000 con tarjeta terminada en 4242\./);
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
    expect(html).toContain('<a href="https://hotel.example.com/web/mi-reserva?codigo=3FA9C21B">');
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
