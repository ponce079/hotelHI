// E-commerce — API pública del motor de reservas web (/api/web), sin
// sesión de staff. Contrato: docs/ecommerce/CONTRATO.md.
const express = require("express");
const ecommerceControlador = require("./ecommerce.controlador");

const router = express.Router();

router.get("/tipos", ecommerceControlador.getTipos);
router.get("/planes", ecommerceControlador.getPlanes);
router.get("/disponibilidad", ecommerceControlador.getDisponibilidad);
router.post("/cotizar", ecommerceControlador.postCotizar);
router.post("/reservas", ecommerceControlador.postReserva);
router.post("/mi-reserva", ecommerceControlador.postMiReserva);

module.exports = router;
