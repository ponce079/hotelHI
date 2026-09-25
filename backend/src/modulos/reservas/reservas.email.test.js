// Cubre HU-41 (email de confirmación de reserva) con nodemailer mockeado:
// nunca manda un correo real al correr la suite, pero si un cambio futuro
// en reservas.servicio.js rompe cómo se arma o se dispara el envío
// (destinatario, asunto, o directamente se deja de llamar a enviarCorreo),
// esto lo detecta. La prueba real contra SMTP/base de datos vive aparte, en
// scripts/prueba-email-reserva.js (manual, no se corre en la suite).

const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const SMTP_ENV = {
  SMTP_HOST: "smtp.ejemplo.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "usuario_smtp",
  SMTP_PASS: "contrasena_smtp",
  SMTP_FROM: "Hotel Holiday Inn <reservas@ejemplo.com>",
  DATABASE_URL: "mysql://usuario:contrasena@localhost:3306/basededatos",
};

function reservaDePrueba() {
  return {
    codigoConfirmacion: "ABCD1234",
    fechaDesde: new Date("2027-01-10T00:00:00.000Z"),
    fechaHasta: new Date("2027-01-12T00:00:00.000Z"),
    huesped: { nombre: "Huésped de Prueba", contacto: "huesped@ejemplo.com" },
    reservaHabitaciones: [{ habitacion: { numero: "204" } }],
  };
}

describe("enviarConfirmacionPorEmail (HU-41)", () => {
  let reservasServicio;

  beforeEach(() => {
    jest.resetModules();
    mockSendMail.mockReset();
    Object.assign(process.env, SMTP_ENV);
    reservasServicio = require("./reservas.servicio");
  });

  test("envía el correo al contacto del huésped con el código de confirmación y devuelve el messageId", async () => {
    mockSendMail.mockResolvedValue({ messageId: "id-de-prueba-123" });

    const resultado = await reservasServicio.enviarConfirmacionPorEmail(reservaDePrueba());

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const envio = mockSendMail.mock.calls[0][0];
    expect(envio.to).toBe("huesped@ejemplo.com");
    expect(envio.subject).toContain("ABCD1234");
    expect(envio.html).toContain("204");

    expect(resultado).toEqual({ enviado: true, messageId: "id-de-prueba-123" });
  });

  test("si el servidor SMTP rechaza el envío, no tira una excepción sino que devuelve enviado: false", async () => {
    mockSendMail.mockRejectedValue(new Error("535 Invalid login"));

    const resultado = await reservasServicio.enviarConfirmacionPorEmail(reservaDePrueba());

    expect(resultado.enviado).toBe(false);
    expect(resultado.motivo).toMatch(/no pudo completar el envío/i);
  });

  test("si falta configuración SMTP, no intenta enviar y avisa qué falta", async () => {
    delete process.env.SMTP_PASS;

    const resultado = await reservasServicio.enviarConfirmacionPorEmail(reservaDePrueba());

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(resultado).toEqual({ enviado: false, motivo: "SMTP no configurado: faltan SMTP_PASS." });
  });
});
