// src/modulos/articulos/articulos.routes.js

const express = require("express");
const articulosControlador = require("./articulos.controlador");

const router = express.Router();

router.post("/", articulosControlador.postArticulo);
router.get("/", articulosControlador.getArticulos);
router.get("/:id", articulosControlador.getArticuloPorId);

module.exports = router;
