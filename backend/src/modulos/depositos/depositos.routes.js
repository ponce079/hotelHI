// src/modulos/depositos/depositos.routes.js
// Solo define endpoints -> controlador. Nada de logica aca.

const express = require("express");
const depositosControlador = require("./depositos.controlador");

const router = express.Router();

router.post("/", depositosControlador.postDeposito);
router.get("/", depositosControlador.getDepositos);
router.get("/:id", depositosControlador.getDepositoPorId);
router.put("/:id", depositosControlador.putDeposito);

module.exports = router;
