const express = require('express');
const checkOutControlador = require('./checkOut.controlador');
const { requiereSesion, requiereRol } = require('../usuarios/usuarios.middleware');
const { ROLES_VER_CHECK_OUT, ROLES_GESTION_CHECK_OUT } = require('./checkOut.constantes');

const router = express.Router();

// Mismo patrón que check-in/checkIn.routes.js. Ver: admin + recepcionista; operar: solo recepcionista.
const verCheckOut = [requiereSesion, requiereRol(...ROLES_VER_CHECK_OUT)];
const gestionarCheckOut = [requiereSesion, requiereRol(...ROLES_GESTION_CHECK_OUT)];

// Antes de las rutas con /:reservaId.
router.get('/garantias-a-revisar', ...verCheckOut, checkOutControlador.getGarantiasARevisar);
router.get('/:reservaId/cuenta', ...verCheckOut, checkOutControlador.getCuenta);
router.get('/:reservaId/verificaciones', ...verCheckOut, checkOutControlador.getVerificaciones);
router.post('/:reservaId/verificaciones', ...gestionarCheckOut, checkOutControlador.postVerificacion);
router.post('/:reservaId/confirmar', ...gestionarCheckOut, checkOutControlador.postConfirmar);

module.exports = router;
