const comprobantesServicio = require('./comprobantes.servicio');
const { TIPOS_COMPROBANTE } = require('./comprobantes.constantes');

// POST /api/comprobantes
async function postComprobante(req, res) {
  try {
    const comprobante = await comprobantesServicio.crearComprobante(req.body);
    return res.status(201).json(comprobante);
  } catch (err) {
    if (err instanceof comprobantesServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al crear comprobante:', err);
    return res.status(500).json({ error: 'No se pudo crear el comprobante.' });
  }
}

// POST /api/comprobantes/con-ajustes
async function postComprobanteConAjustes(req, res) {
  try {
    const resultado = await comprobantesServicio.crearComprobanteConAjustes(req.body);
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof comprobantesServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al crear comprobante con ajustes:', err);
    return res.status(500).json({ error: 'No se pudo crear el comprobante.' });
  }
}

// GET /api/comprobantes
async function getComprobantes(req, res) {
  try {
    const { proveedorId, estado, desde, hasta, soloSaldo, ordenarPor } = req.query;
    const comprobantes = await comprobantesServicio.listarComprobantes({
      proveedorId,
      estado,
      desde,
      hasta,
      soloSaldo: soloSaldo !== 'false', // default true
      ordenarPor
    });
    return res.json(comprobantes);
  } catch (err) {
    if (err instanceof comprobantesServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al listar comprobantes:', err);
    return res.status(500).json({ error: 'No se pudieron listar los comprobantes.' });
  }
}

// GET /api/comprobantes/:id
async function getComprobantePorId(req, res) {
  try {
    const comprobante = await comprobantesServicio.obtenerComprobante(req.params.id);
    return res.json(comprobante);
  } catch (err) {
    if (err instanceof comprobantesServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al obtener comprobante:', err);
    return res.status(500).json({ error: 'No se pudo obtener el comprobante.' });
  }
}

// POST /api/comprobantes/:id/nota
async function postNota(req, res) {
  try {
    const nota = await comprobantesServicio.crearNota(req.params.id, req.body);
    return res.status(201).json(nota);
  } catch (err) {
    if (err instanceof comprobantesServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al crear nota:', err);
    return res.status(500).json({ error: 'No se pudo crear la nota.' });
  }
}

// POST /api/comprobantes/:id/anular
async function postAnular(req, res) {
  try {
    const comprobante = await comprobantesServicio.anularComprobante(req.params.id, req.body.motivo);
    return res.json(comprobante);
  } catch (err) {
    if (err instanceof comprobantesServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error al anular comprobante:', err);
    return res.status(500).json({ error: 'No se pudo anular el comprobante.' });
  }
}

module.exports = {
  postComprobante,
  postComprobanteConAjustes,
  getComprobantes,
  getComprobantePorId,
  postNota,
  postAnular
};