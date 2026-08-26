// src/modulos/movimientos-stock/movimientosStock.routes.js
// Solo define endpoints -> controlador. Nada de lógica acá.

const express = require("express");
const movimientosStockControlador = require("./movimientosStock.controlador");

const router = express.Router();

router.get("/", movimientosStockControlador.getMovimientos);
router.post("/entrada", movimientosStockControlador.registrarEntrada);
router.post("/transferencia", movimientosStockControlador.registrarTransferencia);
router.post("/:id/recepcion", movimientosStockControlador.postRecepcion);

module.exports = router;