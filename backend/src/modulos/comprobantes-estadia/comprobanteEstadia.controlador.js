const comprobanteEstadiaServicio = require('./comprobanteEstadia.servicio');

// POST /api/comprobantes-estadia
async function postComprobante(req, res) {
  try {
    const comprobante = await comprobanteEstadiaServicio.crearComprobante(req.body);
    return res.status(201).json(comprobante);
  } catch (err) {
    if (err instanceof comprobanteEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al crear comprobante de estadía:', err);
    return res.status(500).json({ error: 'No se pudo crear el comprobante.' });
  }
}

// GET /api/comprobantes-estadia?reservaId=&tipo=&desde=&hasta=&q=  (todos opcionales)
async function getComprobantes(req, res) {
  try {
    const comprobantes = await comprobanteEstadiaServicio.listarComprobantes(req.query);
    return res.json(comprobantes);
  } catch (err) {
    if (err instanceof comprobanteEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al listar comprobantes de estadía:', err);
    return res.status(500).json({ error: 'No se pudieron listar los comprobantes.' });
  }
}

// GET /api/comprobantes-estadia/:id
async function getComprobantePorId(req, res) {
  try {
    const comprobante = await comprobanteEstadiaServicio.obtenerComprobante(req.params.id);
    return res.json(comprobante);
  } catch (err) {
    if (err instanceof comprobanteEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al obtener comprobante de estadía:', err);
    return res.status(500).json({ error: 'No se pudo obtener el comprobante.' });
  }
}

// POST /api/comprobantes-estadia/:id/nota-credito
async function postNotaCredito(req, res) {
  try {
    const nota = await comprobanteEstadiaServicio.crearNotaCredito(req.params.id, req.body);
    return res.status(201).json(nota);
  } catch (err) {
    if (err instanceof comprobanteEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al crear nota de crédito:', err);
    return res.status(500).json({ error: 'No se pudo crear la nota de crédito.' });
  }
}

// POST /api/comprobantes-estadia/:id/anular
async function postAnular(req, res) {
  try {
    const comprobante = await comprobanteEstadiaServicio.anularComprobante(req.params.id);
    return res.json(comprobante);
  } catch (err) {
    if (err instanceof comprobanteEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al anular comprobante de estadía:', err);
    return res.status(500).json({ error: 'No se pudo anular el comprobante.' });
  }
}

// GET /api/comprobantes-estadia/reporte-caja-diaria?fecha=YYYY-MM-DD
async function getReporteCajaDiaria(req, res) {
  try {
    const reporte = await comprobanteEstadiaServicio.reporteCajaDiaria(req.query.fecha);
    return res.json(reporte);
  } catch (err) {
    if (err instanceof comprobanteEstadiaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al generar el reporte de caja diaria:', err);
    return res.status(500).json({ error: 'No se pudo generar el reporte.' });
  }
}

module.exports = {
  postComprobante,
  getComprobantes,
  getComprobantePorId,
  postNotaCredito,
  postAnular,
  getReporteCajaDiaria,
};
