// src/modulos/presupuestos/presupuestos.routes.js
//
// El alta de presupuestos (invitar proveedores) NO está acá: cuelga de
// /api/requerimientos/:id/solicitar-presupuestos, porque la acción es
// sobre el requerimiento. Ver requerimientos.routes.js.

const express = require("express");
const presupuestosControlador = require("./presupuestos.controlador");

const router = express.Router();

router.get("/", presupuestosControlador.getPresupuestos);
router.get("/:id", presupuestosControlador.getPresupuestoPorId);
router.put("/:id/cargar", presupuestosControlador.putCargarPresupuesto);
router.post("/:id/aprobar", presupuestosControlador.postAprobarPresupuesto);

module.exports = router;
