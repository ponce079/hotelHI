const tiposHabitacionServicio = require("./tiposHabitacion.servicio");

function responderError(res, err, contexto, mensaje) {
  if (err instanceof tiposHabitacionServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

async function getTiposHabitacion(req, res) {
  try {
    return res.json(await tiposHabitacionServicio.listarTiposHabitacion(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar tipos de habitación:", "No se pudieron listar los tipos de habitación.");
  }
}

async function getTipoHabitacion(req, res) {
  try {
    return res.json(await tiposHabitacionServicio.obtenerTipoHabitacionPorId(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener el tipo de habitación:", "No se pudo obtener el tipo de habitación.");
  }
}

async function postTipoHabitacion(req, res) {
  try {
    return res.status(201).json(await tiposHabitacionServicio.crearTipoHabitacion(req.body));
  } catch (err) {
    return responderError(res, err, "Error al crear el tipo de habitación:", "No se pudo crear el tipo de habitación.");
  }
}

async function putTipoHabitacion(req, res) {
  try {
    return res.json(await tiposHabitacionServicio.actualizarTipoHabitacion(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al actualizar el tipo de habitación:", "No se pudo actualizar el tipo de habitación.");
  }
}

async function patchActivo(req, res) {
  try {
    return res.json(await tiposHabitacionServicio.cambiarActivoTipoHabitacion(req.params.id, req.body?.activo));
  } catch (err) {
    return responderError(res, err, "Error al cambiar la vigencia del tipo de habitación:", "No se pudo cambiar la vigencia del tipo de habitación.");
  }
}

module.exports = { getTiposHabitacion, getTipoHabitacion, postTipoHabitacion, putTipoHabitacion, patchActivo };
