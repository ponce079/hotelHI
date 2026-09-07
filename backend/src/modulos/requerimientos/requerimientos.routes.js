// src/modulos/requerimientos/requerimientos.routes.js

const express = require("express");
const requerimientosControlador = require("./requerimientos.controlador");

const router = express.Router();

router.post("/", requerimientosControlador.postRequerimiento);
router.get("/", requerimientosControlador.getRequerimientos);
// Antes de "/:id": si no, Express intenta resolver "resumen" como un id.
router.get("/resumen", requerimientosControlador.getResumen);
router.get("/:id", requerimientosControlador.getRequerimientoPorId);
router.put("/:id", requerimientosControlador.putRequerimiento);
router.post("/:id/anular", requerimientosControlador.postAnularRequerimiento);
router.post("/:id/solicitar-presupuestos", requerimientosControlador.postSolicitarPresupuestos);
router.post("/:id/compra-express", requerimientosControlador.postCompraExpress);
router.post("/:id/confirmar-sugerencia", requerimientosControlador.postConfirmarSugerencia);

module.exports = router;
