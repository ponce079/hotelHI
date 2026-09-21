const checkOutServicio = require('./checkOut.servicio');

function responderError(res, err, mensajeGenerico, contexto) {
  if (err instanceof checkOutServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(`${contexto}:`, err);
  return res.status(500).json({ error: mensajeGenerico });
}

// GET /api/check-out/:reservaId/cuenta  (HU-48 — cuenta consolidada, ya con HU-87 incluido)
async function getCuenta(req, res) {
  try {
    return res.json(await checkOutServicio.consolidarCargos(req.params.reservaId));
  } catch (err) {
    return responderError(res, err, 'No se pudo consolidar la cuenta.', 'Error al consolidar cargos');
  }
}

// GET /api/check-out/:reservaId/verificaciones
async function getVerificaciones(req, res) {
  try {
    return res.json(await checkOutServicio.listarVerificaciones(req.params.reservaId));
  } catch (err) {
    return responderError(res, err, 'No se pudieron listar las verificaciones.', 'Error al listar verificaciones');
  }
}

// POST /api/check-out/:reservaId/verificaciones  (HU-87)
async function postVerificacion(req, res) {
  try {
    const resultado = await checkOutServicio.registrarVerificacion(req.params.reservaId, req.body);
    return res.status(201).json(resultado);
  } catch (err) {
    return responderError(res, err, 'No se pudo registrar la verificación.', 'Error al registrar verificación');
  }
}

// POST /api/check-out/:reservaId/confirmar  (HU-49 / HU-51 / HU-52)
async function postConfirmar(req, res) {
  try {
    return res.json(await checkOutServicio.confirmarCheckOut(req.params.reservaId, req.body));
  } catch (err) {
    return responderError(res, err, 'No se pudo confirmar el check-out.', 'Error al confirmar check-out');
  }
}

module.exports = { getCuenta, getVerificaciones, postVerificacion, postConfirmar };