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
      // Conexión reutilizada: evita repetir el saludo TLS y la autenticación en cada envío.
      pool: true,
      maxConnections: 2,
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

const ESPERA_MAXIMA_EMAIL_MS = 1500;

// Espera el resultado de un envío como máximo `ms`. Si llega a tiempo lo devuelve tal cual; si no, el envío sigue en
// segundo plano (su fallo va al log, nunca rompe la operación) y se devuelve { enviado: null, enCamino: true }.
function conEsperaMaxima(promesa, { ms = ESPERA_MAXIMA_EMAIL_MS, etiqueta = "email" } = {}) {
  let temporizador;
  const vencio = new Promise((resolve) => {
    temporizador = setTimeout(() => resolve({ enviado: null, enCamino: true }), ms);
  });
  const segura = Promise.resolve(promesa).catch((err) => {
    console.error(`[correo] Falló el envío en segundo plano (${etiqueta}):`, err?.message);
    return { enviado: false };
  });
  segura.then((r) => {
    if (r?.enviado === false) console.error(`[correo] El envío no se completó (${etiqueta}).`);
  });
  return Promise.race([segura, vencio]).finally(() => clearTimeout(temporizador));
}

module.exports = { enviarCorreo, configuracionSMTP, conEsperaMaxima, ESPERA_MAXIMA_EMAIL_MS };
