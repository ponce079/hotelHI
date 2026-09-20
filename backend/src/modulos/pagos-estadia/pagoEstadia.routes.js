const express = require('express');
const pagoEstadiaControlador = require('./pagoEstadia.controlador');

const router = express.Router();

router.post('/', pagoEstadiaControlador.postPago);
router.get('/', pagoEstadiaControlador.getPagos);
router.get('/:id', pagoEstadiaControlador.getPagoPorId);
router.post('/:id/anular', pagoEstadiaControlador.postAnular);

module.exports = router;
