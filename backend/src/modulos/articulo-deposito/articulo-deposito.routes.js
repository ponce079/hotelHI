// src/modulos/articulo-deposito/articulo-deposito.routes.js

const express = require("express");
const articuloDepositoControlador = require("./articulo-deposito.controlador");

const router = express.Router();

router.post("/", articuloDepositoControlador.postArticuloDeposito);
router.get("/", articuloDepositoControlador.getArticuloDepositos);

module.exports = router;
