const nodemailer = require("nodemailer");

let transporter;

function configuracionSMTP() {
  const faltantes = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].filter(
    (clave) => !process.env[clave]
  );
  if (faltantes.length > 0) {
    return { lista: false, faltantes };
  }

  const puerto = Number(process.env.SMTP_PORT || 587);
  return {
    lista: true,
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: String(process.env.SMTP_SECURE || puerto === 465).toLowerCase() === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  };
}

function obtenerTransporter(config) {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }
  return transporter;
}

async function enviarCorreo({ para, asunto, texto, html }) {
  const config = configuracionSMTP();
  if (!config.lista) {
    return {
      enviado: false,
      motivo: `SMTP no configurado: faltan ${config.faltantes.join(", ")}.`,
    };
  }

  try {
    const info = await obtenerTransporter(config).sendMail({
      from: config.from,
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
    return { enviado: true, messageId: info.messageId };
  } catch (error) {
    console.error("[correo] No se pudo enviar el email:", error.message);
    return { enviado: false, motivo: "El servidor de correo rechazó o no pudo completar el envío." };
  }
}

module.exports = { enviarCorreo, configuracionSMTP };
