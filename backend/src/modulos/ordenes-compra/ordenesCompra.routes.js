// src/modulos/ordenes-compra/ordenesCompra.routes.js

const express = require("express");
const ordenesCompraControlador = require("./ordenesCompra.controlador");

const router = express.Router();

router.get("/", ordenesCompraControlador.getOrdenesCompra);
router.get("/:id", ordenesCompraControlador.getOrdenCompraPorId);
router.post("/:id/enviar", ordenesCompraControlador.postEnviarOC);
router.post("/:id/anular", ordenesCompraControlador.postAnularOC);
router.post("/:id/recepcion", ordenesCompraControlador.postRecepcionOC);

module.exports = router;

// Nota: postGenerarOC NO se monta acá. Va en /api/presupuestos/:id/generar-oc,
// dentro del router de Presupuestos — ver presupuestos.routes.js, que ya lo
// monta con este mismo controlador.