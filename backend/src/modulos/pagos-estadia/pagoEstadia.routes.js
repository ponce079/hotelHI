const express = require('express');
const pagoEstadiaControlador = require('./pagoEstadia.controlador');

const router = express.Router();

router.post('/', pagoEstadiaControlador.postPago);
router.get('/', pagoEstadiaControlador.getPagos);
// Antes de "/:id": si no, "/movimientos" entraría por ahí y Prisma
// rechazaría "movimientos" como id numérico.
router.get('/movimientos', pagoEstadiaControlador.getMovimientos);
router.get('/:id', pagoEstadiaControlador.getPagoPorId);
router.post('/:id/anular', pagoEstadiaControlador.postAnular);

module.exports = router;
