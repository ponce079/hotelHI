// HTTP <-> servicio para todo el módulo de tarifas (HU-90 a HU-93) — un
// solo controlador para las 5 entidades, mismo criterio que
// habitaciones.controlador.js con Habitacion + OrdenMantenimiento.

const temporadasServicio = require("./temporadas.servicio");
const planesServicio = require("./planesTarifarios.servicio");
const preciosServicio = require("./precios.servicio");
const modificadoresServicio = require("./modificadoresDiaSemana.servicio");
const lotesServicio = require("./lotesActualizacion.servicio");
const cotizacionServicio = require("./cotizacion.servicio");

function responderError(res, err, contexto, mensaje) {
  if (
    err instanceof temporadasServicio.ErrorDeNegocio ||
    err instanceof planesServicio.ErrorDeNegocio ||
    err instanceof preciosServicio.ErrorDeNegocio ||
    err instanceof modificadoresServicio.ErrorDeNegocio ||
    err instanceof lotesServicio.ErrorDeNegocio ||
    err instanceof cotizacionServicio.ErrorDeNegocio
  ) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

// -------------------- Temporadas --------------------
async function getTemporadas(req, res) {
  try {
    return res.json(await temporadasServicio.listarTemporadas(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar temporadas:", "No se pudieron listar las temporadas.");
  }
}

async function getTemporada(req, res) {
  try {
    return res.json(await temporadasServicio.obtenerTemporadaPorId(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener la temporada:", "No se pudo obtener la temporada.");
  }
}

async function postTemporada(req, res) {
  try {
    return res.status(201).json(await temporadasServicio.crearTemporada(req.body, req.body?.usuario));
  } catch (err) {
    return responderError(res, err, "Error al crear la temporada:", "No se pudo crear la temporada.");
  }
}

async function putTemporada(req, res) {
  try {
    return res.json(await temporadasServicio.actualizarTemporada(req.params.id, req.body, req.body?.usuario));
  } catch (err) {
    return responderError(res, err, "Error al actualizar la temporada:", "No se pudo actualizar la temporada.");
  }
}

async function patchTemporadaActiva(req, res) {
  try {
    return res.json(
      await temporadasServicio.cambiarActivaTemporada(req.params.id, req.body?.activa, req.body?.motivoBaja, req.body?.usuario)
    );
  } catch (err) {
    return responderError(res, err, "Error al cambiar la vigencia de la temporada:", "No se pudo cambiar la vigencia de la temporada.");
  }
}

async function getCalendario(req, res) {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    // Parseo mínimo acá (no exige el helper completo de lib/fechas.js
    // porque el rango de un calendario puede pedir fechas ya pasadas del
    // año en curso, a diferencia de una vigencia de tarifa/temporada).
    const desde = new Date(`${String(fechaDesde).slice(0, 10)}T00:00:00.000Z`);
    const hasta = new Date(`${String(fechaHasta).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return res.status(400).json({ error: "fechaDesde y fechaHasta son obligatorias (formato AAAA-MM-DD)." });
    }
    return res.json(await temporadasServicio.resolverTemporadasEfectivasEnRango(desde, hasta));
  } catch (err) {
    return responderError(res, err, "Error al calcular el calendario:", "No se pudo calcular el calendario.");
  }
}

// -------------------- Planes tarifarios --------------------
async function getPlanes(req, res) {
  try {
    return res.json(await planesServicio.listarPlanesTarifarios(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar planes tarifarios:", "No se pudieron listar los planes tarifarios.");
  }
}

async function getPlan(req, res) {
  try {
    return res.json(await planesServicio.obtenerPlanTarifarioPorId(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener el plan tarifario:", "No se pudo obtener el plan tarifario.");
  }
}

async function postPlan(req, res) {
  try {
    return res.status(201).json(await planesServicio.crearPlanTarifario(req.body, req.body?.usuario));
  } catch (err) {
    return responderError(res, err, "Error al crear el plan tarifario:", "No se pudo crear el plan tarifario.");
  }
}

async function putPlan(req, res) {
  try {
    return res.json(await planesServicio.actualizarPlanTarifario(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al actualizar el plan tarifario:", "No se pudo actualizar el plan tarifario.");
  }
}

async function patchPlanActivo(req, res) {
  try {
    return res.json(
      await planesServicio.cambiarActivoPlanTarifario(req.params.id, req.body?.activo, req.body?.motivoBaja, req.body?.usuario)
    );
  } catch (err) {
    return responderError(res, err, "Error al cambiar la vigencia del plan tarifario:", "No se pudo cambiar la vigencia del plan tarifario.");
  }
}

// -------------------- Precios (Tarifa) --------------------
async function getGrilla(_req, res) {
  try {
    return res.json(await preciosServicio.grillaTarifas());
  } catch (err) {
    return responderError(res, err, "Error al calcular la grilla de tarifas:", "No se pudo calcular la grilla de tarifas.");
  }
}

async function getHistorialTarifa(req, res) {
  try {
    return res.json(await preciosServicio.historialTarifa(req.query.tipoHabitacionId, req.query.temporadaId));
  } catch (err) {
    return responderError(res, err, "Error al obtener el historial de la tarifa:", "No se pudo obtener el historial de la tarifa.");
  }
}

async function postTarifa(req, res) {
  try {
    return res.status(201).json(await preciosServicio.crearTarifa(req.body, req.body?.usuario));
  } catch (err) {
    return responderError(res, err, "Error al crear la tarifa:", "No se pudo crear la tarifa.");
  }
}

async function putTarifa(req, res) {
  try {
    return res.json(await preciosServicio.actualizarTarifa(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al actualizar la tarifa:", "No se pudo actualizar la tarifa.");
  }
}

async function deleteTarifa(req, res) {
  try {
    await preciosServicio.eliminarTarifa(req.params.id);
    return res.status(204).send();
  } catch (err) {
    return responderError(res, err, "Error al borrar la tarifa:", "No se pudo borrar la tarifa.");
  }
}

// -------------------- Modificador por día de semana --------------------
async function getModificadores(_req, res) {
  try {
    return res.json(await modificadoresServicio.listarModificadores());
  } catch (err) {
    return responderError(res, err, "Error al listar los modificadores:", "No se pudieron listar los modificadores.");
  }
}

async function putModificador(req, res) {
  try {
    return res.json(await modificadoresServicio.actualizarModificador(req.params.diaSemana, req.body?.porcentaje));
  } catch (err) {
    return responderError(res, err, "Error al actualizar el modificador:", "No se pudo actualizar el modificador.");
  }
}

// -------------------- Lotes de actualización masiva --------------------
async function getLotes(_req, res) {
  try {
    return res.json(await lotesServicio.listarLotes());
  } catch (err) {
    return responderError(res, err, "Error al listar los lotes de actualización:", "No se pudieron listar los lotes de actualización.");
  }
}

async function postVistaPrevia(req, res) {
  try {
    return res.json(await lotesServicio.calcularVistaPrevia(req.body));
  } catch (err) {
    return responderError(res, err, "Error al calcular la vista previa:", "No se pudo calcular la vista previa.");
  }
}

async function postLote(req, res) {
  try {
    return res.status(201).json(await lotesServicio.confirmarActualizacion(req.body, req.body?.usuario));
  } catch (err) {
    return responderError(res, err, "Error al confirmar la actualización masiva:", "No se pudo confirmar la actualización masiva.");
  }
}

async function postAnularLote(req, res) {
  try {
    return res.json(await lotesServicio.anularLote(req.params.id, req.body?.motivoAnulacion, req.body?.usuario));
  } catch (err) {
    return responderError(res, err, "Error al anular el lote:", "No se pudo anular el lote.");
  }
}

// -------------------- Cotización (HU-94, Etapa 3) --------------------
// `fechaVenta` es de uso interno (tests/Etapa 4 llamando a cotizarEstadia
// directo) — el endpoint público NUNCA la toma de req.body, siempre cotiza
// a la fecha de venta de hoy.
async function postCotizar(req, res) {
  try {
    const { tipoHabitacionId, fechaIngreso, fechaEgreso, adultos, menores, canal } = req.body || {};
    return res.json(await cotizacionServicio.cotizarEstadia({ tipoHabitacionId, fechaIngreso, fechaEgreso, adultos, menores, canal }));
  } catch (err) {
    return responderError(res, err, "Error al cotizar la estadía:", "No se pudo cotizar la estadía.");
  }
}

module.exports = {
  getTemporadas,
  getTemporada,
  postTemporada,
  putTemporada,
  patchTemporadaActiva,
  getCalendario,
  getPlanes,
  getPlan,
  postPlan,
  putPlan,
  patchPlanActivo,
  getGrilla,
  getHistorialTarifa,
  postTarifa,
  putTarifa,
  deleteTarifa,
  getModificadores,
  putModificador,
  getLotes,
  postVistaPrevia,
  postLote,
  postAnularLote,
  postCotizar,
};
