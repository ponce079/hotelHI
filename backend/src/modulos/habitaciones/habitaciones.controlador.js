const habitacionesServicio = require("./habitaciones.servicio");

function responderError(res, err, contexto, mensaje) {
  if (err instanceof habitacionesServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

async function getHabitaciones(req, res) {
  try {
    const habitaciones = await habitacionesServicio.listarHabitaciones(req.query);
    return res.json(habitaciones);
  } catch (err) {
    return responderError(res, err, "Error al listar habitaciones:", "No se pudieron listar las habitaciones.");
  }
}

async function getTiposHabitacion(_req, res) {
  try {
    return res.json(await habitacionesServicio.listarTiposHabitacion());
  } catch (err) {
    return responderError(res, err, "Error al listar tipos de habitación:", "No se pudieron listar los tipos de habitación.");
  }
}

async function getHabitacion(req, res) {
  try {
    return res.json(await habitacionesServicio.obtenerHabitacion(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener la habitación:", "No se pudo obtener la habitación.");
  }
}

async function postHabitacion(req, res) {
  try {
    return res.status(201).json(await habitacionesServicio.crearHabitacion(req.body));
  } catch (err) {
    return responderError(res, err, "Error al crear la habitación:", "No se pudo crear la habitación.");
  }
}

async function putHabitacion(req, res) {
  try {
    return res.json(await habitacionesServicio.actualizarHabitacion(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al actualizar la habitación:", "No se pudo actualizar la habitación.");
  }
}

async function patchEstado(req, res) {
  try {
    return res.json(
      await habitacionesServicio.cambiarEstadoHabitacion(req.params.id, req.body?.estado, req.body?.motivoBloqueo)
    );
  } catch (err) {
    return responderError(res, err, "Error al cambiar el estado de la habitación:", "No se pudo cambiar el estado de la habitación.");
  }
}

async function patchActivo(req, res) {
  try {
    return res.json(await habitacionesServicio.cambiarActivoHabitacion(req.params.id, req.body?.activo));
  } catch (err) {
    return responderError(res, err, "Error al cambiar la vigencia de la habitación:", "No se pudo cambiar la vigencia de la habitación.");
  }
}

async function postOrdenMantenimiento(req, res) {
  try {
    return res.status(201).json(await habitacionesServicio.crearOrdenMantenimiento(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al crear la orden de mantenimiento:", "No se pudo crear la orden de mantenimiento.");
  }
}

async function getOrdenesMantenimiento(req, res) {
  try {
    return res.json(await habitacionesServicio.listarOrdenesMantenimiento(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar órdenes de mantenimiento:", "No se pudieron listar las órdenes de mantenimiento.");
  }
}

async function getNotificaciones(req, res) {
  try {
    return res.json(await habitacionesServicio.listarNotificaciones(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar notificaciones:", "No se pudieron listar las notificaciones.");
  }
}

module.exports = {
  getHabitaciones,
  getTiposHabitacion,
  getHabitacion,
  postHabitacion,
  putHabitacion,
  patchEstado,
  patchActivo,
  postOrdenMantenimiento,
  getOrdenesMantenimiento,
  getNotificaciones,
};
