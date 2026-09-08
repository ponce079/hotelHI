// src/modulos/ordenes-compra/ordenesCompra.controlador.js
//
// Traduce HTTP <-> servicio. Mismo patrón que pagos.controlador.js.

const ordenesCompraServicio = require("./ordenesCompra.servicio");

// POST /api/presupuestos/:id/generar-oc (mapeado desde el módulo de
// Presupuestos — ver nota de coordinación en ordenesCompra.routes.js)
async function postGenerarOC(req, res) {
  try {
    const oc = await ordenesCompraServicio.generarOC({
      presupuestoId: req.params.id,
      usuario: req.body?.usuario,
    });
    return res.status(201).json(oc);
  } catch (err) {
    if (err instanceof ordenesCompraServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al generar la orden de compra:", err);
    return res.status(500).json({ error: "No se pudo generar la orden de compra." });
  }
}

async function getOrdenesCompra(req, res) {
  try {
    const resultado = await ordenesCompraServicio.listarOCs(req.query);
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar órdenes de compra:", err);
    return res.status(500).json({ error: "No se pudieron obtener las órdenes de compra." });
  }
}

async function getOrdenCompraPorId(req, res) {
  try {
    const oc = await ordenesCompraServicio.obtenerOCPorId(req.params.id);
    return res.json(oc);
  } catch (err) {
    if (err instanceof ordenesCompraServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al obtener la orden de compra:", err);
    return res.status(500).json({ error: "No se pudo obtener la orden de compra." });
  }
}

async function postEnviarOC(req, res) {
  try {
    const oc = await ordenesCompraServicio.enviarOC(req.params.id, req.body?.usuario);
    return res.json(oc);
  } catch (err) {
    if (err instanceof ordenesCompraServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al enviar la orden de compra:", err);
    return res.status(500).json({ error: "No se pudo enviar la orden de compra." });
  }
}

async function postAnularOC(req, res) {
  const { motivo, usuario } = req.body || {};
  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: "El motivo de anulación es obligatorio." });
  }
  try {
    const oc = await ordenesCompraServicio.anularOC(req.params.id, motivo, usuario);
    return res.json(oc);
  } catch (err) {
    if (err instanceof ordenesCompraServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al anular la orden de compra:", err);
    return res.status(500).json({ error: "No se pudo anular la orden de compra." });
  }
}

async function postRecepcionOC(req, res) {
  const { detalle, usuario } = req.body || {};
  if (!Array.isArray(detalle) || detalle.length === 0) {
    return res.status(400).json({ error: "Falta el detalle de artículos recibidos." });
  }
  for (const linea of detalle) {
    if (!linea.articuloId || linea.cantidadRecibida === undefined) {
      return res.status(400).json({ error: "Cada línea necesita articuloId y cantidadRecibida." });
    }
  }
  try {
    const oc = await ordenesCompraServicio.registrarRecepcion(req.params.id, detalle, usuario);
    return res.json(oc);
  } catch (err) {
    if (err instanceof ordenesCompraServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al registrar la recepción:", err);
    return res.status(500).json({ error: "No se pudo registrar la recepción." });
  }
}

async function postRevisarDiferencia(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }
  try {
    const oc = await ordenesCompraServicio.marcarDiferenciaRevisada(id, req.body);
    return res.status(200).json(oc);
  } catch (err) {
    if (err instanceof ordenesCompraServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al marcar la diferencia de la orden de compra como revisada:", err);
    return res.status(500).json({ error: "No se pudo marcar la diferencia como revisada." });
  }
}

module.exports = {
  postGenerarOC,
  getOrdenesCompra,
  getOrdenCompraPorId,
  postEnviarOC,
  postAnularOC,
  postRecepcionOC,
  postRevisarDiferencia,
};