const pagoEstadiaServicio = require('./pagoEstadia.servicio');

// POST /api/pagos-estadia
async function postPago(req, res) {
  try {
    const pago = await pagoEstadiaServicio.crearPago(req.body);
    return res.status(201).json(pago);
  } catch (err) {
    if (err instanceof pagoEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al registrar el pago de estadía:', err);
    return res.status(500).json({ error: 'No se pudo registrar el pago.' });
  }
}

// GET /api/pagos-estadia?reservaId=  -> { pagos, totalAdeudado, totalPagado, saldo }
async function getPagos(req, res) {
  try {
    const { reservaId } = req.query;
    if (!reservaId) {
      return res.status(400).json({ error: 'reservaId es obligatorio para listar pagos.' });
    }
    const resultado = await pagoEstadiaServicio.listarPorReserva(reservaId);
    return res.json(resultado);
  } catch (err) {
    if (err instanceof pagoEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al listar pagos de estadía:', err);
    return res.status(500).json({ error: 'No se pudieron listar los pagos.' });
  }
}

// GET /api/pagos-estadia/movimientos?q=&concepto=&desde=&hasta=
// HU-88 — listado global (todas las reservas), a diferencia de getPagos que
// exige reservaId. Ruta propia en vez de hacer opcional el reservaId de
// arriba: esa devuelve {pagos,totalAdeudado,totalPagado,saldo} (contrato que
// ya usa Check-out) y esta un array plano — mezclarlas en el mismo handler
// rompería uno de los dos contratos.
async function getMovimientos(req, res) {
  try {
    const movimientos = await pagoEstadiaServicio.listarMovimientos(req.query);
    return res.json(movimientos);
  } catch (err) {
    if (err instanceof pagoEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al listar los movimientos de pago:', err);
    return res.status(500).json({ error: 'No se pudieron listar los movimientos de pago.' });
  }
}

// GET /api/pagos-estadia/:id
async function getPagoPorId(req, res) {
  try {
    const pago = await pagoEstadiaServicio.obtenerPago(req.params.id);
    return res.json(pago);
  } catch (err) {
    if (err instanceof pagoEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al obtener el pago de estadía:', err);
    return res.status(500).json({ error: 'No se pudo obtener el pago.' });
  }
}

// POST /api/pagos-estadia/:id/anular
async function postAnular(req, res) {
  try {
    const pago = await pagoEstadiaServicio.anularPago(req.params.id, req.body?.motivo);
    return res.json(pago);
  } catch (err) {
    if (err instanceof pagoEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al anular el pago de estadía:', err);
    return res.status(500).json({ error: 'No se pudo anular el pago.' });
  }
}

module.exports = { postPago, getPagos, getMovimientos, getPagoPorId, postAnular };
