// src/modulos/requerimientos/requerimientos.routes.js

const express = require("express");
const requerimientosControlador = require("./requerimientos.controlador");

const router = express.Router();

router.post("/", requerimientosControlador.postRequerimiento);
router.get("/", requerimientosControlador.getRequerimientos);
router.get("/:id", requerimientosControlador.getRequerimientoPorId);
router.post("/:id/solicitar-presupuestos", requerimientosControlador.postSolicitarPresupuestos);

module.exports = router;
