const serviciosAdicionalesServicio = require("./serviciosAdicionales.servicio");

function responderError(res, err, contexto, mensaje) {
  if (err instanceof serviciosAdicionalesServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

// POST /api/consumos-servicios
async function postConsumo(req, res) {
  try {
    return res.status(201).json(await serviciosAdicionalesServicio.registrarConsumo(req.body));
  } catch (err) {
    return responderError(res, err, "Error al registrar el consumo:", "No se pudo registrar el consumo.");
  }
}

// GET /api/consumos-servicios?reservaId=&tipoServicio=
async function getConsumos(req, res) {
  try {
    const { reservaId, tipoServicio } = req.query;
    if (!reservaId) throw new serviciosAdicionalesServicio.ErrorDeNegocio("reservaId es obligatorio.");
    return res.json(await serviciosAdicionalesServicio.listarPorReserva(reservaId, { tipoServicio }));
  } catch (err) {
    return responderError(res, err, "Error al listar consumos:", "No se pudieron listar los consumos.");
  }
}

// GET /api/consumos-servicios/resumen?reservaId=
async function getResumen(req, res) {
  try {
    const { reservaId } = req.query;
    if (!reservaId) throw new serviciosAdicionalesServicio.ErrorDeNegocio("reservaId es obligatorio.");
    return res.json(await serviciosAdicionalesServicio.resumenPorReserva(reservaId));
  } catch (err) {
    return responderError(res, err, "Error al calcular el resumen de consumos:", "No se pudo calcular el resumen.");
  }
}

// GET /api/consumos-servicios/hotel/resumen?desde=&hasta=&tipoServicio=
// Ajuste de flujo (Sprint 3): consulta de todo el hotel por período, para
// el ítem de menú que ahora es de solo lectura (ver serviciosAdicionales.servicio.js).
async function getResumenHotel(req, res) {
  try {
    const { desde, hasta, tipoServicio } = req.query;
    return res.json(await serviciosAdicionalesServicio.resumenConsumosHotel({ desde, hasta, tipoServicio }));
  } catch (err) {
    return responderError(res, err, "Error al calcular el resumen del hotel:", "No se pudo calcular el resumen.");
  }
}

module.exports = { postConsumo, getConsumos, getResumen, getResumenHotel };
