// src/modulos/cuenta-corriente/cuentaCorriente.routes.js
//
// Dos routers, uno por prefijo (/api/proveedores y /api/cuenta-corriente)
// — no hay un modulo de Proveedores propio todavia (HU-18 a 21), asi que
// routerProveedores es la unica ruta bajo /api/proveedores por ahora.
// Un "/:id" de un futuro modulo de Proveedores no choca con esta: Express
// no matchea rutas de un solo segmento contra un path con mas segmentos.

const express = require("express");
const cuentaCorrienteControlador = require("./cuentaCorriente.controlador");

const routerProveedores = express.Router();
routerProveedores.get("/:id/cuenta-corriente", cuentaCorrienteControlador.getCuentaCorriente);

const routerCuentaCorriente = express.Router();
routerCuentaCorriente.get("/resumen", cuentaCorrienteControlador.getResumen);

module.exports = { routerProveedores, routerCuentaCorriente };
