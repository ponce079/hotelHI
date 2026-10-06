// Prueba manual de los emails del e-commerce (etapa 4 — Tomás): manda a un
// email de destino la confirmación de una reserva web (tarifa flexible y no
// reembolsable) y la de una cancelación, con datos de EJEMPLO.
//
// No toca la base: solo usa el SMTP configurado en backend/.env (SMTP_HOST,
// SMTP_USER, SMTP_PASS, SMTP_FROM). Sirve para ver cómo se ven los emails en
// un cliente de correo real (Gmail, Outlook, el celular).
//
//   node scripts/prueba-email-web.js <email-destino>

require("dotenv").config();

const { enviarConfirmacion, enviarCancelacion } = require("../src/modulos/ecommerce/emailWeb.servicio");
const { configuracionSMTP } = require("../src/lib/correo");

const destino = process.argv[2];
if (!destino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
  console.error("Uso: node scripts/prueba-email-web.js <email-destino>");
  process.exit(1);
}

const smtp = configuracionSMTP();
if (!smtp.lista) {
  console.error(`El SMTP no está configurado en backend/.env: faltan ${smtp.faltantes.join(", ")}.`);
  process.exit(1);
}

const base = {
  codigoConfirmacion: "F2AAF1C6",
  estado: "Confirmada",
  fechaDesde: "2026-11-20",
  fechaHasta: "2026-11-23",
  noches: 3,
  total: 75000,
  habitaciones: [{ tipo: "Doble", adultos: 2, menores: 1 }],
};
const flexible = {
  ...base,
  plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48 },
  cobradoAhora: 0,
  garantia: { tipo: "GARANTIA", marca: "VISA", ultimos4: "4242" },
};
const noReembolsable = {
  ...base,
  codigoConfirmacion: "5D21A7F0",
  total: 63750,
  plan: { codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: null },
  cobradoAhora: 63750,
  garantia: { tipo: "PREPAGO", marca: "MASTERCARD", ultimos4: "4444" },
};

(async () => {
  const resultados = [
    ["Confirmación (tarifa flexible)", await enviarConfirmacion(flexible, destino, {
      nombre: "María José",
      horaEstimadaLlegada: "20-22",
      solicitudesEspeciales: "Cuna para bebé, si es posible.",
      penalidadNoShow: "PRIMERA_NOCHE",
    })],
    ["Confirmación (no reembolsable)", await enviarConfirmacion(noReembolsable, destino, {
      nombre: "María José",
      penalidadNoShow: "TOTAL_ESTADIA",
    })],
    ["Cancelación", await enviarCancelacion({ ...flexible, estado: "Cancelada" }, destino)],
  ];
  for (const [nombre, { enviado }] of resultados) console.log(`${enviado ? "OK " : "ERROR"}  ${nombre}`);
  process.exit(resultados.every(([, r]) => r.enviado) ? 0 : 1);
})();
