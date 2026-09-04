// src/modulos/cuenta-corriente/cuentaCorriente.routes.js
//
// Dos routers, uno por prefijo (/api/proveedores y /api/cuenta-corriente).
// routerProveedores comparte el prefijo /api/proveedores con el modulo de
// Proveedores (HU-18 a 21, montado despues en index.js): no choca porque
// Express no matchea un "/:id/cuenta-corriente" de dos segmentos contra
// las rutas de un solo segmento ("/", "/:id") de ese modulo.

const express = require("express");
const cuentaCorrienteControlador = require("./cuentaCorriente.controlador");

const routerProveedores = express.Router();
routerProveedores.get("/:id/cuenta-corriente", cuentaCorrienteControlador.getCuentaCorriente);

const routerCuentaCorriente = express.Router();
routerCuentaCorriente.get("/resumen", cuentaCorrienteControlador.getResumen);

module.exports = { routerProveedores, routerCuentaCorriente };
