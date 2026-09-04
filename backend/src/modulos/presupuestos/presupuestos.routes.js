// src/modulos/presupuestos/presupuestos.routes.js
//
// El alta de presupuestos (invitar proveedores) NO está acá: cuelga de
// /api/requerimientos/:id/solicitar-presupuestos, porque la acción es
// sobre el requerimiento. Ver requerimientos.routes.js.

const express = require("express");
const presupuestosControlador = require("./presupuestos.controlador");
const ordenesCompraControlador = require("../ordenes-compra/ordenesCompra.controlador");

const router = express.Router();

router.get("/", presupuestosControlador.getPresupuestos);
router.get("/:id", presupuestosControlador.getPresupuestoPorId);
router.put("/:id/cargar", presupuestosControlador.putCargarPresupuesto);
router.post("/:id/aprobar", presupuestosControlador.postAprobarPresupuesto);
// HU-22: generar la OC a partir de este presupuesto ya adjudicado. La
// lógica vive en el módulo de Órdenes de Compra (Gimena/Ricardo) — ver
// ordenesCompra.servicio.js. Coordinado en el PR de Órdenes de Compra.
router.post("/:id/generar-oc", ordenesCompraControlador.postGenerarOC);

module.exports = router;
