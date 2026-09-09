const express = require('express');
const controlador = require('./comprobantes.controlador');

const router = express.Router();

router.post('/', controlador.postComprobante);
router.post('/con-ajustes', controlador.postComprobanteConAjustes);
router.get('/', controlador.getComprobantes);
router.get('/:id', controlador.getComprobantePorId);
router.post('/:id/nota', controlador.postNota);
router.post('/:id/anular', controlador.postAnular);

module.exports = router;