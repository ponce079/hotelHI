// Email de confirmación de una reserva web (HU-103, versión simple del
// backend; la versión final del contenido es de Tomás). Usa enviarCorreo de
// lib/correo.js, que nunca tira: si el SMTP falla, la reserva igual queda
// creada y la respuesta dice email.enviado = false. No reemplaza ni toca
// enviarConfirmacionPorEmail (el email del alta del mostrador).
const { enviarCorreo } = require("../../lib/correo");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const HORA_CHECKIN = "14 h";

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fechaLarga(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

function precio(monto) {
  const n = Number(monto);
  const entero = Math.round(n * 100) % 100 === 0;
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: entero ? 0 : 2 })}`;
}

// Mismo criterio que formato.js del frontend (nombreComercialPlan y
// textoCondicionesPlan): el huésped nunca ve el nombre interno del plan.
function nombreComercialPlan(plan) {
  return plan.reembolsable ? "Tarifa flexible" : "No reembolsable";
}

function condicionesPlan(plan) {
  return plan.reembolsable
    ? `Cancelación sin cargo hasta ${plan.horasCancelacionSinCargo} h antes de la llegada`
    : "Se cobra el total al reservar · Sin devolución";
}

// Link a Mi reserva (HU-104): WEB_PUBLIC_URL (opcional) es la URL pública del
// sitio, sin barra final. Con ella: <URL>/web/mi-reserva?codigo=<código> (el
// email nunca viaja en la URL). Sin ella, el texto indica cómo llegar.
function textoMiReserva(codigo) {
  const base = String(process.env.WEB_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    return { texto: "Ingresá a Mi reserva en nuestra web con tu código y tu email.", url: null };
  }
  const url = `${base}/web/mi-reserva?codigo=${encodeURIComponent(codigo)}`;
  return { texto: `Consultá o cancelá tu reserva en ${url}`, url };
}

const textoOcupacion = ({ adultos, menores }) =>
  `${adultos} ${adultos === 1 ? "adulto" : "adultos"}${menores ? ` y ${menores} ${menores === 1 ? "menor" : "menores"}` : ""}`;

// Arma asunto, texto plano y HTML (escapado) a partir de la respuesta
// pública del alta: nunca hay números de habitación ni datos de la tarjeta
// más allá de los últimos 4.
function armarEmail(reserva) {
  const { codigoConfirmacion, fechaDesde, fechaHasta, noches, plan, total, cobradoAhora, garantia, habitaciones } = reserva;
  const pago = plan.reembolsable
    ? `Garantizada con tarjeta terminada en ${garantia.ultimos4}, no se cobró nada.`
    : `Cobrado ${precio(cobradoAhora)} con tarjeta terminada en ${garantia.ultimos4}.`;
  const lineasHabitaciones = habitaciones.map((h) => `Habitación ${h.tipo} · ${textoOcupacion(h)}`);
  const miReserva = textoMiReserva(codigoConfirmacion);
  const lineas = [
    `Tu reserva en Holiday Inn está confirmada.`,
    ``,
    `Código de reserva: ${codigoConfirmacion}`,
    `Entrada: ${fechaLarga(fechaDesde)} (check-in desde las ${HORA_CHECKIN})`,
    `Salida: ${fechaLarga(fechaHasta)}`,
    `${noches} ${noches === 1 ? "noche" : "noches"}`,
    ...lineasHabitaciones,
    `Tarifa: ${nombreComercialPlan(plan)} · ${condicionesPlan(plan)}`,
    `Total: ${precio(total)} (IVA incluido)`,
    pago,
    ``,
    miReserva.texto,
  ];
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1b1a16;line-height:1.5">
      <h2 style="color:#1f4d3a">Tu reserva está confirmada</h2>
      <p style="font-size:18px"><strong>Código de reserva: ${escaparHTML(codigoConfirmacion)}</strong></p>
      <p>Entrada: ${escaparHTML(fechaLarga(fechaDesde))} (check-in desde las ${HORA_CHECKIN})<br>
         Salida: ${escaparHTML(fechaLarga(fechaHasta))}<br>
         ${noches} ${noches === 1 ? "noche" : "noches"}</p>
      <p>${lineasHabitaciones.map(escaparHTML).join("<br>")}</p>
      <p>Tarifa: ${escaparHTML(nombreComercialPlan(plan))} · ${escaparHTML(condicionesPlan(plan))}<br>
         <strong>Total: ${escaparHTML(precio(total))}</strong> (IVA incluido)<br>
         ${escaparHTML(pago)}</p>
      <p>${
        miReserva.url
          ? `Consultá o cancelá tu reserva en <a href="${escaparHTML(miReserva.url)}">${escaparHTML(miReserva.url)}</a>`
          : escaparHTML(miReserva.texto)
      }</p>
    </div>`;
  return { asunto: `Reserva confirmada · ${codigoConfirmacion}`, texto: lineas.join("\n"), html };
}

// Devuelve { enviado: boolean }. Nunca tira.
async function enviarConfirmacion(reserva, emailContacto) {
  try {
    const { asunto, texto, html } = armarEmail(reserva);
    const resultado = await enviarCorreo({ para: emailContacto, asunto, texto, html });
    return { enviado: resultado.enviado === true };
  } catch (err) {
    console.error("[ecommerce] No se pudo armar o enviar el email de confirmación:", err?.message);
    return { enviado: false };
  }
}

// Email de cancelación (HU-104): online solo se cancela sin cargo.
function armarEmailCancelacion(reserva) {
  const { codigoConfirmacion, fechaDesde, fechaHasta, noches, plan, habitaciones } = reserva;
  const lineasHabitaciones = habitaciones.map((h) => `Habitación ${h.tipo} · ${textoOcupacion(h)}`);
  const tarifa = nombreComercialPlan(plan);
  const lineas = [
    `Tu reserva ${codigoConfirmacion} fue cancelada.`,
    ``,
    `Entrada: ${fechaLarga(fechaDesde)}`,
    `Salida: ${fechaLarga(fechaHasta)}`,
    `${noches} ${noches === 1 ? "noche" : "noches"}`,
    ...lineasHabitaciones,
    tarifa,
    ``,
    "No se realizó ningún cargo.",
    "Si no fuiste vos quien canceló, contactá a recepción.",
  ];
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1b1a16;line-height:1.5">
      <h2 style="color:#8e2c22">Tu reserva ${escaparHTML(codigoConfirmacion)} fue cancelada</h2>
      <p>Entrada: ${escaparHTML(fechaLarga(fechaDesde))}<br>
         Salida: ${escaparHTML(fechaLarga(fechaHasta))}<br>
         ${noches} ${noches === 1 ? "noche" : "noches"}</p>
      <p>${lineasHabitaciones.map(escaparHTML).join("<br>")}<br>${escaparHTML(tarifa)}</p>
      <p><strong>No se realizó ningún cargo.</strong></p>
      <p>Si no fuiste vos quien canceló, contactá a recepción.</p>
    </div>`;
  return { asunto: `Tu reserva ${codigoConfirmacion} fue cancelada`, texto: lineas.join("\n"), html };
}

// Devuelve { enviado: boolean }. Nunca tira.
async function enviarCancelacion(reserva, para) {
  try {
    if (!para) return { enviado: false };
    const { asunto, texto, html } = armarEmailCancelacion(reserva);
    const resultado = await enviarCorreo({ para, asunto, texto, html });
    return { enviado: resultado.enviado === true };
  } catch (err) {
    console.error("[ecommerce] No se pudo armar o enviar el email de cancelación:", err?.message);
    return { enviado: false };
  }
}

module.exports = { armarEmail, enviarConfirmacion, armarEmailCancelacion, enviarCancelacion, textoMiReserva };
