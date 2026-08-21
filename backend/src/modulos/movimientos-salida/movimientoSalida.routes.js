// src/modulos/movimiento-salida/movimientoSalida.routes.js
// Solo define endpoints -> controlador. Nada de lógica acá.

const express = require("express");
const movimientoSalidaControlador = require("./movimientoSalida.controlador");

const router = express.Router();

router.post("/salida", movimientoSalidaControlador.registrarSalida);

module.exports = router;
