// E-commerce — API pública del motor de reservas web (/api/web), sin
// sesión de staff. Contrato: docs/ecommerce/CONTRATO.md.
// Cada ruta pasa primero por el límite de intentos por IP (HU-106,
// limiteIntentos.js): 429 DEMASIADOS_INTENTOS si se supera.
const express = require("express");
const ecommerceControlador = require("./ecommerce.controlador");
const { limitar } = require("./limiteIntentos");

const router = express.Router();

router.get("/tipos", limitar("consulta"), ecommerceControlador.getTipos);
router.get("/planes", limitar("consulta"), ecommerceControlador.getPlanes);
router.get("/disponibilidad", limitar("consulta"), ecommerceControlador.getDisponibilidad);
router.post("/cotizar", limitar("cotizar"), ecommerceControlador.postCotizar);
router.post("/reservas", limitar("reserva"), ecommerceControlador.postReserva);
router.post("/mi-reserva", limitar("miReserva"), ecommerceControlador.postMiReserva);
router.post("/mi-reserva/cancelar", limitar("miReserva"), ecommerceControlador.postCancelarMiReserva);

module.exports = router;
