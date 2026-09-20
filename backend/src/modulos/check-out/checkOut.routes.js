const express = require('express');
const checkOutControlador = require('./checkOut.controlador');

const router = express.Router();

router.get('/:reservaId/cuenta', checkOutControlador.getCuenta);
router.get('/:reservaId/verificaciones', checkOutControlador.getVerificaciones);
router.post('/:reservaId/verificaciones', checkOutControlador.postVerificacion);
router.post('/:reservaId/confirmar', checkOutControlador.postConfirmar);

module.exports = router;
