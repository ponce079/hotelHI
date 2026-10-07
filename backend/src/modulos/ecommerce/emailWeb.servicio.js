// Emails del e-commerce: confirmación de una reserva web (HU-103, versión
// definitiva — Tomás, etapa 4) y cancelación desde Mi reserva (HU-104).
//
// Usa enviarCorreo de lib/correo.js, que nunca tira: si el SMTP falla, la
// reserva igual queda creada y la respuesta dice email.enviado = false. No
// reemplaza ni toca enviarConfirmacionPorEmail (el email del alta del
// mostrador).
//
// Cada email sale en texto plano y en HTML. El HTML está hecho para clientes
// de correo (tablas, estilos en línea, ancho máximo 600 px, sin imágenes ni
// scripts) con los colores de la guía de estilo. Todo dato variable pasa por
// escaparHTML. Nunca lleva números de habitación ni datos de la tarjeta más
// allá de la marca y los últimos 4, ni el email del huésped en un link.
const { enviarCorreo } = require("../../lib/correo");
const { formatearInstanteArgentina } = require("../../lib/fechas");
const { calcularLimiteSinCargo } = require("../tarifas/limiteCancelacion");
const { HOTEL } = require("./ecommerce.hotel");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const HORA_CHECKIN = HOTEL.checkIn;
const HORA_CHECKOUT = HOTEL.checkOut;
const NOMBRE_HOTEL = HOTEL.nombre;
const BAJADA_HOTEL = HOTEL.bajada;

// Contacto del hotel (datos ficticios del proyecto académico, ver ecommerce.hotel.js).
const CONTACTO = `${HOTEL.telefono} · ${HOTEL.email}`;
const LINEA_HOTEL = `${NOMBRE_HOTEL} · ${HOTEL.direccion} · ${CONTACTO}`;
const TEXTO_DATOS_PERSONALES = `Usamos tus datos solo para gestionar tu reserva. Para consultarlos, corregirlos o pedir que los eliminemos, escribinos a ${HOTEL.email} (Ley 25.326).`;

// Guía de estilo (mockups, pág. 15).
const COLOR = {
  verdeProfundo: "#0E3326",
  verde: "#1F4D3A",
  verdeClaro: "#E4EEE6",
  crema: "#F5F2EA",
  papel: "#FDFCF8",
  linea: "#E4DED0",
  tinta: "#1B2620",
  texto2: "#56605A",
  doradoClaro: "#F3ECDA",
  doradoTexto: "#7D5E26",
  rojo: "#8E2C22",
};
const FUENTE = "Helvetica,Arial,sans-serif";
const FUENTE_TITULO = "Georgia,'Times New Roman',serif";

const NOMBRE_MARCA = { VISA: "Visa", MASTERCARD: "Mastercard", AMEX: "American Express" };

// Mismos valores que HORAS_LLEGADA del frontend (ecommerce.constantes.js).
const TEXTO_LLEGADA = {
  "14-16": "entre las 14 y las 16 h",
  "16-18": "entre las 16 y las 18 h",
  "18-20": "entre las 18 y las 20 h",
  "20-22": "entre las 20 y las 22 h",
  DESPUES_22: "después de las 22 h",
};

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

// "viernes 16 de octubre de 2026" (día calendario, sin huso horario).
function fechaConDia(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()]} ${fechaLarga(iso)}`;
}

function precio(monto) {
  const n = Number(monto);
  const entero = Math.round(n * 100) % 100 === 0;
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: entero ? 0 : 2 })}`;
}

const textoNoches = (noches) => `${noches} ${noches === 1 ? "noche" : "noches"}`;

// Mismo criterio que formato.js del frontend (nombreComercialPlan y
// textoCondicionesPlan): el huésped nunca ve el nombre interno del plan.
function nombreComercialPlan(plan) {
  return plan.reembolsable ? "Tarifa flexible" : "No reembolsable";
}

// "viernes 13/11/2026 a las 14:00": la llegada a la hora de check-in menos las horas del plan (la misma
// fórmula que calcularPenalidad, vía calcularLimiteSinCargo), en hora argentina. Sin consultar la base.
function limiteSinCargo(reserva) {
  return formatearInstanteArgentina(calcularLimiteSinCargo(reserva.fechaDesde, reserva.plan.horasCancelacionSinCargo));
}

function condicionesPlan(plan, limite) {
  return plan.reembolsable ? `Cancelación sin cargo hasta el ${limite}` : "Se cobra el total al reservar · Sin devolución";
}

const TEXTO_CARGO_DESPUES = "Después de esa fecha, la cancelación tiene un cargo de la primera noche.";
const TEXTO_NO_SHOW_NRF = "Si no te presentás, no se reintegra el importe pagado.";
const TEXTO_RECEPCION = `contactá a recepción (${CONTACTO})`;

// Mismo texto que textoNoShow del frontend (busquedaWeb.js).
function textoNoShow(penalidadNoShow) {
  if (penalidadNoShow === "PRIMERA_NOCHE") return "Si no te presentás, se cobra la primera noche.";
  if (penalidadNoShow === "TOTAL_ESTADIA") return "Si no te presentás, se cobra el total de la estadía.";
  return "";
}

// "tarjeta Visa terminada en 4242" (marca OTRA o desconocida: "tarjeta terminada en 4242").
function textoTarjeta(garantia) {
  const marca = NOMBRE_MARCA[garantia?.marca];
  return `tarjeta ${marca ? `${marca} ` : ""}terminada en ${garantia?.ultimos4 ?? "----"}`;
}

// Link a Mi reserva (HU-104): WEB_PUBLIC_URL (opcional) es la URL pública del
// sitio, sin barra final. Con ella: <URL>/web/mi-reserva?codigo=<código> (el
// email nunca viaja en la URL). Sin ella, el texto indica cómo llegar.
// `cancelable` false (tarifa no reembolsable): solo se consulta, no se habla de cancelar.
function textoMiReserva(codigo, { cancelable = true } = {}) {
  const base = String(process.env.WEB_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    return {
      texto: cancelable
        ? "Ingresá a Mi reserva en nuestra web con tu código y tu email."
        : "Consultá tu reserva en nuestra web con tu código y tu email.",
      url: null,
    };
  }
  const url = `${base}/web/mi-reserva?codigo=${encodeURIComponent(codigo)}`;
  return { texto: cancelable ? `Consultá o cancelá tu reserva en ${url}` : `Consultá tu reserva en ${url}`, url };
}

const textoOcupacion = ({ adultos, menores }) =>
  `${adultos} ${adultos === 1 ? "adulto" : "adultos"}${menores ? ` y ${menores} ${menores === 1 ? "menor" : "menores"}` : ""}`;

// Saludo con los nombres del titular ("Hola, María José"; sin nombre, "Hola").
function saludo(nombre) {
  const limpio = String(nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return limpio ? `Hola, ${limpio}` : "Hola";
}

// --- Piezas del HTML (todo lo variable llega ya escapado) --------------------

function filaDato(etiqueta, valorHTML, detalleHTML = "") {
  return `
            <tr>
              <td style="padding:14px 0;border-top:1px solid ${COLOR.linea};width:38%;vertical-align:top;font-family:${FUENTE};font-size:12px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:${COLOR.texto2}">${etiqueta}</td>
              <td style="padding:14px 0;border-top:1px solid ${COLOR.linea};vertical-align:top;font-family:${FUENTE};font-size:15px;color:${COLOR.tinta}">${valorHTML}${
                detalleHTML ? `<br><span style="font-size:13px;color:${COLOR.texto2}">${detalleHTML}</span>` : ""
              }</td>
            </tr>`;
}

function botonHTML(url, texto) {
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0">
            <tr>
              <td style="border-radius:12px;background:${COLOR.verde}">
                <a href="${escaparHTML(url)}" style="display:inline-block;padding:14px 26px;font-family:${FUENTE};font-size:15px;font-weight:bold;color:${COLOR.papel};text-decoration:none;border-radius:12px">${escaparHTML(texto)}</a>
              </td>
            </tr>
          </table>`;
}

// Marco común: preheader oculto, encabezado verde, tarjeta y pie.
function plantilla({ preheader, contenido }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${NOMBRE_HOTEL}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.crema}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.crema}">${escaparHTML(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.crema}">
    <tr>
      <td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
          <tr>
            <td style="background:${COLOR.verdeProfundo};border-radius:18px 18px 0 0;padding:22px 32px">
              <div style="font-family:${FUENTE_TITULO};font-size:22px;font-weight:bold;color:${COLOR.papel}">${NOMBRE_HOTEL}</div>
              <div style="font-family:${FUENTE};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#C9D6CE">${BAJADA_HOTEL}</div>
            </td>
          </tr>
          <tr>
            <td style="background:${COLOR.papel};border:1px solid ${COLOR.linea};border-top:0;border-radius:0 0 18px 18px;padding:32px">
${contenido}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:${COLOR.texto2};text-align:center">
              Recibís este email porque se hizo una reserva con tu dirección en la web de ${NOMBRE_HOTEL}.<br>
              Si no la hiciste vos, ${escaparHTML(TEXTO_RECEPCION)}.<br>
              ${escaparHTML(TEXTO_DATOS_PERSONALES)}<br>
              ${escaparHTML(LINEA_HOTEL)}<br>
              Precios en pesos argentinos, IVA incluido.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Confirmación -------------------------------------------------------------

// Arma asunto, texto plano y HTML a partir de la respuesta pública del alta
// (armarRespuestaAlta) y, opcionalmente, de datos del alta que no viajan en
// esa respuesta: { nombre, horaEstimadaLlegada, solicitudesEspeciales, penalidadNoShow }.
function armarEmail(reserva, extra = {}) {
  const { codigoConfirmacion, fechaDesde, fechaHasta, noches, plan, total, cobradoAhora, garantia, habitaciones } = reserva;
  const llegada = TEXTO_LLEGADA[extra.horaEstimadaLlegada] ?? null;
  const solicitudes = String(extra.solicitudesEspeciales ?? "").trim();
  const noShow = plan.reembolsable ? textoNoShow(extra.penalidadNoShow) : TEXTO_NO_SHOW_NRF;
  const miReserva = textoMiReserva(codigoConfirmacion, { cancelable: plan.reembolsable });
  const limite = plan.reembolsable ? limiteSinCargo(reserva) : null;

  const estado = plan.reembolsable ? "Confirmada · garantizada con tarjeta" : "Pagada";
  const pago = plan.reembolsable
    ? `Garantizada con ${textoTarjeta(garantia)}, no se cobró nada.`
    : `Cobrado ${precio(cobradoAhora)} con ${textoTarjeta(garantia)}.`;
  const cancelacion = plan.reembolsable
    ? `Podés cancelar sin cargo hasta el ${limite} desde Mi reserva, con tu código y tu email.`
    : `Esta tarifa no admite cancelación con devolución. Para cualquier consulta, ${TEXTO_RECEPCION}.`;
  const lineasHabitaciones = habitaciones.map((h) => `Habitación ${h.tipo} · ${textoOcupacion(h)}`);

  const lineas = [
    `${saludo(extra.nombre)}:`,
    "",
    `Tu reserva en ${NOMBRE_HOTEL} está confirmada.`,
    "",
    `Código de reserva: ${codigoConfirmacion}`,
    `Estado: ${estado}`,
    `Entrada: ${fechaLarga(fechaDesde)} (check-in desde las ${HORA_CHECKIN})`,
    `Salida: ${fechaLarga(fechaHasta)} (check-out hasta las ${HORA_CHECKOUT})`,
    textoNoches(noches),
    ...lineasHabitaciones,
    `Tarifa: ${nombreComercialPlan(plan)} · ${condicionesPlan(plan, limite)}`,
    ...(plan.reembolsable ? [TEXTO_CARGO_DESPUES] : []),
    ...(noShow ? [noShow] : []),
    `Total: ${precio(total)} (IVA incluido)`,
    pago,
    ...(llegada ? [`Llegada estimada: ${llegada}`] : []),
    ...(solicitudes ? [`Solicitudes especiales: ${solicitudes}`] : []),
    "",
    cancelacion,
    miReserva.texto,
    "",
    "Antes de llegar:",
    "- Traé el DNI o pasaporte de cada persona que se aloja: registramos a todos los huéspedes en el check-in.",
    "- Los menores de 18 años se alojan con un adulto responsable; si viajan sin sus padres, traé la autorización correspondiente.",
    `- El check-in es desde las ${HORA_CHECKIN}. Tu habitación está garantizada aunque llegues tarde.`,
    "- Guardá este código: lo necesitás para consultar o cancelar tu reserva.",
    "",
    TEXTO_DATOS_PERSONALES,
    LINEA_HOTEL,
    "Precios en pesos argentinos, IVA incluido.",
  ];

  const filas = [
    filaDato("Entrada", escaparHTML(fechaConDia(fechaDesde)), `Check-in desde las ${HORA_CHECKIN}`),
    filaDato("Salida", escaparHTML(fechaConDia(fechaHasta)), `Check-out hasta las ${HORA_CHECKOUT}`),
    filaDato("Estadía", escaparHTML(textoNoches(noches))),
    filaDato(
      habitaciones.length > 1 ? "Habitaciones" : "Habitación",
      habitaciones.map((h) => `${escaparHTML(h.tipo)} · ${escaparHTML(textoOcupacion(h))}`).join("<br>")
    ),
    filaDato(
      "Tarifa",
      escaparHTML(nombreComercialPlan(plan)),
      [escaparHTML(condicionesPlan(plan, limite)), plan.reembolsable && escaparHTML(TEXTO_CARGO_DESPUES), noShow && escaparHTML(noShow)]
        .filter(Boolean)
        .join("<br>")
    ),
    filaDato("Total", `<strong>${escaparHTML(precio(total))}</strong>`, "IVA incluido"),
    filaDato("Pago", escaparHTML(pago)),
    ...(llegada ? [filaDato("Llegada estimada", escaparHTML(llegada))] : []),
    ...(solicitudes ? [filaDato("Solicitudes", escaparHTML(solicitudes), "Las pasamos a recepción.")] : []),
  ].join("");

  const contenido = `
          <p style="margin:0 0 6px;font-family:${FUENTE};font-size:12px;font-weight:bold;letter-spacing:0.16em;text-transform:uppercase;color:${COLOR.verde}">Reserva confirmada</p>
          <h1 style="margin:0 0 16px;font-family:${FUENTE_TITULO};font-size:30px;line-height:1.2;color:${COLOR.verdeProfundo}">¡Listo, te esperamos!</h1>
          <p style="margin:0 0 20px;font-family:${FUENTE};font-size:16px;line-height:1.5;color:${COLOR.tinta}">${escaparHTML(saludo(extra.nombre))}. Tu reserva está confirmada; estos son los detalles.</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.verdeProfundo};border-radius:14px">
            <tr>
              <td style="padding:18px 24px;font-family:${FUENTE};font-size:13px;color:#C9D6CE;white-space:nowrap">Código de reserva</td>
              <td align="right" style="padding:18px 24px;font-family:${FUENTE_TITULO};font-size:28px;font-weight:bold;letter-spacing:0.06em;color:${COLOR.papel}">${escaparHTML(codigoConfirmacion)}</td>
            </tr>
          </table>
          <p style="margin:12px 0 24px">
            <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${COLOR.verdeClaro};font-family:${FUENTE};font-size:13px;font-weight:bold;color:${COLOR.verde}">${escaparHTML(estado)}</span>
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:${COLOR.crema};border-radius:12px">
            <tr>
              <td style="padding:18px 20px;font-family:${FUENTE};font-size:14px;line-height:1.5;color:${COLOR.tinta}">
                <strong>Cambios y cancelación.</strong> ${escaparHTML(cancelacion)}
                ${miReserva.url ? botonHTML(miReserva.url, "Ver mi reserva") : `<br>${escaparHTML(miReserva.texto)}`}
              </td>
            </tr>
          </table>

          <h2 style="margin:28px 0 8px;font-family:${FUENTE_TITULO};font-size:20px;color:${COLOR.verdeProfundo}">Antes de llegar</h2>
          <ul style="margin:0;padding-left:20px;font-family:${FUENTE};font-size:14px;line-height:1.6;color:${COLOR.tinta}">
            <li>Traé el DNI o pasaporte de cada persona que se aloja: registramos a todos los huéspedes en el check-in.</li>
            <li>Los menores de 18 años se alojan con un adulto responsable; si viajan sin sus padres, traé la autorización correspondiente.</li>
            <li>El check-in es desde las ${HORA_CHECKIN}. Tu habitación está garantizada aunque llegues tarde.</li>
            <li>Guardá este código: lo necesitás para consultar o cancelar tu reserva.</li>
          </ul>`;

  return {
    asunto: `Reserva confirmada · ${codigoConfirmacion}`,
    texto: lineas.join("\n"),
    html: plantilla({ preheader: `Código ${codigoConfirmacion} · ${fechaLarga(fechaDesde)} al ${fechaLarga(fechaHasta)}`, contenido }),
  };
}

// Devuelve { enviado: boolean }. Nunca tira.
async function enviarConfirmacion(reserva, emailContacto, extra = {}) {
  try {
    const { asunto, texto, html } = armarEmail(reserva, extra);
    const resultado = await enviarCorreo({ para: emailContacto, asunto, texto, html });
    return { enviado: resultado.enviado === true };
  } catch (err) {
    console.error("[ecommerce] No se pudo armar o enviar el email de confirmación:", err?.message);
    return { enviado: false };
  }
}

// --- Cancelación (HU-104: online, con o sin cargo) ----------------------------

// Qué se le dice al huésped sobre el dinero. `cargo` es el resultado de la cancelación (miReserva.cancelacion.js):
// { estado: SIN_CARGO | COBRADO | RETENIDO | PENDIENTE, monto, tarjeta: { marca, ultimos4 } | null }.
function textoCargoCancelacion(cargo) {
  const monto = Number(cargo?.monto ?? 0);
  switch (cargo?.estado) {
    case "COBRADO": {
      const t = cargo.tarjeta;
      const marca = t?.marca ? `${t.marca[0].toUpperCase()}${t.marca.slice(1).toLowerCase()} ` : "";
      return t?.ultimos4
        ? `Se cobró ${precio(monto)} con tu tarjeta ${marca}terminada en ${t.ultimos4} (cargo por cancelación).`
        : `Se cobró ${precio(monto)} (cargo por cancelación).`;
    }
    case "RETENIDO":
      return `No se reintegra el importe pagado (${precio(monto)}).`;
    case "PENDIENTE":
      return `El cargo de ${precio(monto)} quedó pendiente; recepción se va a comunicar con vos.`;
    default:
      return "No se realizó ningún cargo.";
  }
}

function armarEmailCancelacion(reserva, cargo = null) {
  const textoCargo = textoCargoCancelacion(cargo);
  const sinCargo = !cargo || cargo.estado === "SIN_CARGO";
  const { codigoConfirmacion, fechaDesde, fechaHasta, noches, plan, habitaciones } = reserva;
  const lineasHabitaciones = habitaciones.map((h) => `Habitación ${h.tipo} · ${textoOcupacion(h)}`);
  const tarifa = nombreComercialPlan(plan);
  const lineas = [
    `Tu reserva ${codigoConfirmacion} fue cancelada.`,
    ``,
    `Entrada: ${fechaLarga(fechaDesde)}`,
    `Salida: ${fechaLarga(fechaHasta)}`,
    textoNoches(noches),
    ...lineasHabitaciones,
    tarifa,
    ``,
    textoCargo,
    `Si no fuiste vos quien canceló, ${TEXTO_RECEPCION}.`,
    "",
    TEXTO_DATOS_PERSONALES,
    LINEA_HOTEL,
  ];

  const filas = [
    filaDato("Entrada", escaparHTML(fechaConDia(fechaDesde))),
    filaDato("Salida", escaparHTML(fechaConDia(fechaHasta))),
    filaDato("Estadía", escaparHTML(textoNoches(noches))),
    filaDato(
      habitaciones.length > 1 ? "Habitaciones" : "Habitación",
      habitaciones.map((h) => `${escaparHTML(h.tipo)} · ${escaparHTML(textoOcupacion(h))}`).join("<br>")
    ),
    filaDato("Tarifa", escaparHTML(tarifa)),
  ].join("");

  const contenido = `
          <p style="margin:0 0 6px;font-family:${FUENTE};font-size:12px;font-weight:bold;letter-spacing:0.16em;text-transform:uppercase;color:${COLOR.rojo}">Reserva cancelada</p>
          <h1 style="margin:0 0 16px;font-family:${FUENTE_TITULO};font-size:28px;line-height:1.2;color:${COLOR.verdeProfundo}">Tu reserva ${escaparHTML(codigoConfirmacion)} fue cancelada</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:${COLOR.verdeClaro};border-radius:12px">
            <tr>
              <td style="padding:16px 20px;font-family:${FUENTE};font-size:15px;color:${COLOR.verde}"><strong>${escaparHTML(textoCargo)}</strong></td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-family:${FUENTE};font-size:14px;line-height:1.5;color:${COLOR.tinta}">${escaparHTML(`Si no fuiste vos quien canceló, ${TEXTO_RECEPCION}.`)}</p>`;

  return {
    asunto: `Tu reserva ${codigoConfirmacion} fue cancelada`,
    texto: lineas.join("\n"),
    html: plantilla({ preheader: sinCargo ? `Tu reserva ${codigoConfirmacion} fue cancelada sin cargo.` : `Tu reserva ${codigoConfirmacion} fue cancelada.`, contenido }),
  };
}

// Devuelve { enviado: boolean }. Nunca tira.
async function enviarCancelacion(reserva, para, cargo = null) {
  try {
    if (!para) return { enviado: false };
    const { asunto, texto, html } = armarEmailCancelacion(reserva, cargo);
    const resultado = await enviarCorreo({ para, asunto, texto, html });
    return { enviado: resultado.enviado === true };
  } catch (err) {
    console.error("[ecommerce] No se pudo armar o enviar el email de cancelación:", err?.message);
    return { enviado: false };
  }
}

module.exports = { armarEmail, enviarConfirmacion, armarEmailCancelacion, enviarCancelacion, textoMiReserva, textoCargoCancelacion };
