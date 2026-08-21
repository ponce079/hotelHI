// src/modulos/movimientos-stock/movimientosStock.routes.js
// Solo define endpoints -> controlador. Nada de lógica acá.

const express = require("express");
const movimientosStockControlador = require("./movimientosStock.controlador");

const router = express.Router();

router.post("/entrada", movimientosStockControlador.registrarEntrada);

module.exports = router;
