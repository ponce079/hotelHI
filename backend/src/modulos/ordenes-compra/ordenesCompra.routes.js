// src/modulos/ordenes-compra/ordenesCompra.routes.js

const express = require("express");
const ordenesCompraControlador = require("./ordenesCompra.controlador");

const router = express.Router();

router.get("/", ordenesCompraControlador.getOrdenesCompra);
router.get("/:id", ordenesCompraControlador.getOrdenCompraPorId);
router.post("/:id/aprobar", ordenesCompraControlador.postAprobarOC);
router.post("/:id/enviar", ordenesCompraControlador.postEnviarOC);
router.post("/:id/anular", ordenesCompraControlador.postAnularOC);
router.post("/:id/recepcion", ordenesCompraControlador.postRecepcionOC);

module.exports = router;

// Nota: postGenerarOC NO se monta acá. Va en /api/presupuestos/:id/generar-oc,
// dentro del router de Presupuestos (módulo de Tomás/Agustín), que hoy
// todavía no existe en el repo (ver INTEGRACION.md). Cuando lo creen, que
// agreguen:
//
//   const ordenesCompraControlador = require("../ordenes-compra/ordenesCompra.controlador");
//   router.post("/:id/generar-oc", ordenesCompraControlador.postGenerarOC);