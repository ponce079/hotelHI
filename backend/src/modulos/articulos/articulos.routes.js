// src/modulos/articulos/articulos.routes.js

const express = require("express");
const articulosControlador = require("./articulos.controlador");

const router = express.Router();

router.post("/", articulosControlador.postArticulo);
router.get("/", articulosControlador.getArticulos);
router.get("/:id", articulosControlador.getArticuloPorId);
router.put("/:id", articulosControlador.putArticulo);
router.patch("/:id/estado", articulosControlador.patchEstadoArticulo);

module.exports = router;
