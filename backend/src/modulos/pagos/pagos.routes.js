// src/modulos/pagos/pagos.routes.js

const express = require("express");
const pagosControlador = require("./pagos.controlador");

const router = express.Router();

// Rutas especificas antes de "/:id", si no Express las confunde con un id.
router.get("/proveedores-con-saldo", pagosControlador.getProveedoresConSaldo);
router.get("/comprobantes-pendientes", pagosControlador.getComprobantesPendientes);
router.post("/", pagosControlador.postOrdenPago);
router.get("/", pagosControlador.getOrdenesPago);
router.get("/:id", pagosControlador.getOrdenPagoPorId);
router.patch("/:id/anular", pagosControlador.patchAnularOrdenPago);
router.patch("/:id/medios/:medioId/estado-cheque", pagosControlador.patchEstadoCheque);

module.exports = router;
