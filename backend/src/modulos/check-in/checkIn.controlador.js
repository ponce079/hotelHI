const checkInServicio = require("./checkIn.servicio");
const estadiaServicio = require("../estadia/estadia.servicio");
const reservasServicio = require("../reservas/reservas.servicio");
const checkInApoyo = require("./checkIn.apoyo.servicio");
const { responderEsperaConexion } = require("../../lib/erroresConexion");

function responderError(res, err, contexto, mensaje) {
  if (responderEsperaConexion(res, err)) return;
  if (
    err instanceof checkInServicio.ErrorDeNegocio ||
    err instanceof estadiaServicio.ErrorDeNegocio ||
    err instanceof reservasServicio.ErrorDeNegocio
  ) {
    return res.status(err.statusCode).json({ error: err.message, codigo: err.codigo, detalle: err.detalle });
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

// GET /api/check-in/habitaciones-libres?fechaHasta=&tipoHabitacionId=&capacidadMinima=
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
    if (Object.hasOwn(req.body, "cantidadesOcupantes"))
      return res
        .status(400)
        .json({
          error:
            "La ocupación se obtiene de la reserva. Actualizá la pantalla; " +
            "no se admite una segunda declaración de cantidades.",
        });
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
    if (Object.hasOwn(req.body, "cantidadesOcupantes"))
      return res
        .status(400)
        .json({
          error:
            "Indicá adultos y menores en las habitaciones de la reserva, sin una segunda declaración de cantidades.",
        });
    return res.status(201).json(await checkInServicio.registrarCheckInWalkIn(req.body));
  } catch (err) {
    return responderError(res, err, "Error al registrar el check-in walk-in:", "No se pudo registrar el check-in.");
  }
}

// GET /api/check-in/llegadas?q= — reservas Confirmadas que ingresan hoy (rediseño).
async function getLlegadas(req, res) {
  try {
    return res.json(await checkInApoyo.listarLlegadas(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar las llegadas:", "No se pudieron listar las llegadas de hoy.");
  }
}

// POST /api/check-in/:reservaId/previa-ocupacion — solo lectura (rediseño).
async function postPreviaOcupacion(req, res) {
  try {
    return res.json(await checkInApoyo.previaOcupacion(req.params.reservaId, req.body ?? {}));
  } catch (err) {
    return responderError(res, err, "Error en la vista previa de ocupación:", "No se pudo calcular la vista previa.");
  }
}

module.exports = {
  getLlegadas,
  postPreviaOcupacion,
  getBuscarReserva,
  getHabitacionesLibres,
  postConfirmarConReserva,
  postCheckInWalkIn,
};
