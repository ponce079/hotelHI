jest.mock("../../lib/correo", () => ({ enviarCorreo: jest.fn() }));
const { enviarCorreo } = require("../../lib/correo");
const { armarEmail, enviarConfirmacion } = require("./emailWeb.servicio");

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
