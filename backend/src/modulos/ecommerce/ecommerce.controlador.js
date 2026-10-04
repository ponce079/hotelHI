// Controlador del e-commerce (/api/web). Rutas públicas, sin sesión. Nunca
// loguea el request ni el body: un error inesperado se registra solo con su
// mensaje y stack (ecommerce.errores.js → responderError).
const ecommerceServicio = require("./ecommerce.servicio");
const { responderError } = require("./ecommerce.errores");

async function getTipos(req, res) {
  try {
    return res.json(await ecommerceServicio.obtenerTipos());
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

module.exports = { getTipos, getDisponibilidad, postCotizar };
