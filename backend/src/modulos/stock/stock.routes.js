// src/modulos/stock/stock.routes.js

const express = require("express");
const stockControlador = require("./stock.controlador");

const router = express.Router();

router.get("/", stockControlador.consultarStock);

module.exports = router;