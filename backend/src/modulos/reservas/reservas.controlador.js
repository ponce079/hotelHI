const reservasServicio = require("./reservas.servicio");

function responderError(res, err, contexto, mensaje) {
  if (err instanceof reservasServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

// HU-38 — consulta pública de disponibilidad por fecha y tipo. Va antes
// que getReservaPorId en el router: si no, "/disponibilidad" entraría por
// "/:id" y fallaría pidiendo un id numérico.
async function getDisponibilidad(req, res) {
  try {
    return res.json(await reservasServicio.consultarDisponibilidad(req.query));
  } catch (err) {
    return responderError(res, err, "Error al consultar disponibilidad:", "No se pudo consultar la disponibilidad.");
  }
}

async function getReservas(req, res) {
  try {
    return res.json(await reservasServicio.listarReservas(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar reservas:", "No se pudieron listar las reservas.");
  }
}

async function getReservaPorCodigo(req, res) {
  try {
    return res.json(await reservasServicio.obtenerPorCodigoConfirmacion(req.params.codigo));
  } catch (err) {
    return responderError(res, err, "Error al buscar la reserva por código:", "No se pudo buscar la reserva.");
  }
}

async function getReservaPorId(req, res) {
  try {
    return res.json(await reservasServicio.obtenerReserva(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener la reserva:", "No se pudo obtener la reserva.");
  }
}

// HU-36 (alta asistida por recepcionista) y HU-40 (autoservicio web): el
// mismo endpoint y la misma validación de disponibilidad para los dos
// canales, sin duplicar lógica — la pantalla pública manda origen: "WEB"
// y eso solo cambia el texto de la confirmación.
// HU-95 (regla 5) — cotización previa a confirmar un alta o una
// modificación (mostrador o web), sin persistir nada.
async function postCotizar(req, res) {
  try {
    return res.json(await reservasServicio.cotizarParaReserva(req.body));
  } catch (err) {
    return responderError(res, err, "Error al cotizar la reserva:", "No se pudo cotizar la reserva.");
  }
}

async function postReserva(req, res) {
  try {
    return res.status(201).json(await reservasServicio.crearReserva(req.body));
  } catch (err) {
    return responderError(res, err, "Error al crear la reserva:", "No se pudo crear la reserva.");
  }
}

// HU-88 (extensión) — alta de reserva CON seña en una sola operación
// atómica (ver crearReservaConSena en reservas.servicio.js). Reemplaza,
// para el alta asistida por mostrador (HU-36 con seña obligatoria), al par
// de llamadas postReserva + POST /pagos-estadia que usaba antes.
async function postReservaConSenia(req, res) {
  try {
    return res.status(201).json(await reservasServicio.crearReservaConSena(req.body));
  } catch (err) {
    return responderError(res, err, "Error al crear la reserva con seña:", "No se pudo crear la reserva con la seña.");
  }
}

async function patchReserva(req, res) {
  try {
    return res.json(await reservasServicio.modificarReserva(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al modificar la reserva:", "No se pudo modificar la reserva.");
  }
}

async function postCancelar(req, res) {
  try {
    return res.json(await reservasServicio.cancelarReserva(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al cancelar la reserva:", "No se pudo cancelar la reserva.");
  }
}

module.exports = {
  getDisponibilidad,
  getReservas,
  getReservaPorCodigo,
  getReservaPorId,
  postCotizar,
  postReserva,
  postReservaConSenia,
  patchReserva,
  postCancelar,
};
