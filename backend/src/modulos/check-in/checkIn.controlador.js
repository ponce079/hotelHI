const checkInServicio = require("./checkIn.servicio");

function responderError(res, err, contexto, mensaje) {
  if (err.code === 'P2002') return res.status(409).json({error:'Una persona ya tiene un ingreso activo. Revisá sus datos.'});
  if (err instanceof checkInServicio.ErrorDeNegocio || err instanceof require('../estadia/estadia.servicio').ErrorDeNegocio || err instanceof require('../reservas/reservas.servicio').ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

// GET /api/check-in/buscar-reserva?id=&codigo=
async function getBuscarReserva(req, res) {
  try {
    return res.json(await checkInServicio.buscarReservaParaCheckIn(req.query));
  } catch (err) {
    return responderError(res, err, "Error al buscar la reserva para check-in:", "No se pudo buscar la reserva.");
  }
}

// GET /api/check-in/habitaciones-libres?fechaHasta=&tipo=&capacidadMinima=
async function getHabitacionesLibres(req, res) {
  try {
    return res.json(await checkInServicio.listarHabitacionesLibresAhora(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar habitaciones libres:", "No se pudieron listar las habitaciones libres.");
  }
}

// POST /api/check-in/:reservaId/confirmar
async function postConfirmarConReserva(req, res) {
  try {
    const resultado = await checkInServicio.confirmarCheckInConReserva({
      reservaId: req.params.reservaId,
      ...req.body,
    });
    return res.json(resultado);
  } catch (err) {
    return responderError(res, err, "Error al confirmar el check-in:", "No se pudo confirmar el check-in.");
  }
}

// POST /api/check-in/walk-in
async function postCheckInWalkIn(req, res) {
  try {
    return res.status(201).json(await checkInServicio.registrarCheckInWalkIn(req.body));
  } catch (err) {
    return responderError(res, err, "Error al registrar el check-in walk-in:", "No se pudo registrar el check-in.");
  }
}

module.exports = {
  getBuscarReserva,
  getHabitacionesLibres,
  postConfirmarConReserva,
  postCheckInWalkIn,
};

module.exports = {
  getBuscarReserva,
  getHabitacionesLibres,
  postConfirmarConReserva,
  postCheckInWalkIn,
};
