// Controlador del e-commerce (/api/web). Rutas públicas, sin sesión. Nunca
// loguea el request ni el body: un error inesperado se registra solo con su
// mensaje y stack (ecommerce.errores.js → responderError).
const ecommerceServicio = require("./ecommerce.servicio");
const reservaWebServicio = require("./reservaWeb.servicio");
const miReservaServicio = require("./miReserva.servicio");
const miReservaCancelacion = require("./miReserva.cancelacion");
const { responderError } = require("./ecommerce.errores");

async function getTipos(req, res) {
  try {
    return res.json(await ecommerceServicio.obtenerTipos());
  } catch (err) {
    return responderError(res, err);
  }
}

async function getPlanes(req, res) {
  try {
    return res.json(await ecommerceServicio.obtenerPlanes());
  } catch (err) {
    return responderError(res, err);
  }
}

async function getDisponibilidad(req, res) {
  try {
    return res.json(await ecommerceServicio.consultarDisponibilidad(req.query));
  } catch (err) {
    return responderError(res, err);
  }
}

async function postCotizar(req, res) {
  try {
    return res.json(await ecommerceServicio.cotizar(req.body));
  } catch (err) {
    return responderError(res, err, { origen: "cotizar" });
  }
}

// POST /api/web/reservas. La tarjeta se separa del body apenas llega y solo
// viaja al servicio: el resto del cuerpo nunca la lleva, y nada de este
// controlador la loguea ni la devuelve.
async function postReserva(req, res) {
  const { tarjeta, ...cuerpo } = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const { status, cuerpo: respuesta } = await reservaWebServicio.crearReservaWeb(cuerpo, tarjeta);
    return res.status(status).json(respuesta);
  } catch (err) {
    return responderError(res, err, { origen: "alta" });
  }
}

// POST /api/web/mi-reserva — consulta con código + email (HU-104).
async function postMiReserva(req, res) {
  try {
    return res.json(await miReservaServicio.consultarMiReserva(req.body));
  } catch (err) {
    return responderError(res, err);
  }
}

// POST /api/web/mi-reserva/cancelar — cancelación online sin cargo (HU-104).
async function postCancelarMiReserva(req, res) {
  try {
    return res.json(await miReservaCancelacion.cancelarMiReserva(req.body));
  } catch (err) {
    return responderError(res, err);
  }
}

module.exports = { getTipos, getPlanes, getDisponibilidad, postCotizar, postReserva, postMiReserva, postCancelarMiReserva };
