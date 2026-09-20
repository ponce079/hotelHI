const express = require('express');
const comprobanteEstadiaControlador = require('./comprobanteEstadia.controlador');

const router = express.Router();

// Ruta específica antes de "/:id", si no Express la confunde con un id
// (mismo criterio que pagos.routes.js, Sprint 2).
router.get('/reporte-caja-diaria', comprobanteEstadiaControlador.getReporteCajaDiaria);

router.post('/', comprobanteEstadiaControlador.postComprobante);
router.get('/', comprobanteEstadiaControlador.getComprobantes);
router.get('/:id', comprobanteEstadiaControlador.getComprobantePorId);
router.post('/:id/nota-credito', comprobanteEstadiaControlador.postNotaCredito);
router.post('/:id/anular', comprobanteEstadiaControlador.postAnular);

module.exports = router;
