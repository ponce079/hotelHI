// E-commerce — API pública del motor de reservas web (/api/web), sin
// sesión de staff. Contrato: docs/ecommerce/CONTRATO.md.
// POST /reservas y /mi-reserva llegan en la etapa 1B-2 y la etapa 4.
const express = require("express");
const ecommerceControlador = require("./ecommerce.controlador");

const router = express.Router();

router.get("/tipos", ecommerceControlador.getTipos);
router.get("/disponibilidad", ecommerceControlador.getDisponibilidad);
router.post("/cotizar", ecommerceControlador.postCotizar);

module.exports = router;
