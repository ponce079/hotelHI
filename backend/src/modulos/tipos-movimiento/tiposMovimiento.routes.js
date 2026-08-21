// src/modulos/tipos-movimiento/tiposMovimiento.routes.js
// Solo define endpoints -> controlador. Nada de logica aca.

const express = require("express");
const tiposMovimientoControlador = require("./tiposMovimiento.controlador");

const router = express.Router();

router.post("/", tiposMovimientoControlador.postTipoMovimiento);
router.get("/", tiposMovimientoControlador.getTiposMovimiento);

module.exports = router;
