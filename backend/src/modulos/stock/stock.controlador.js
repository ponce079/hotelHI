// src/modulos/stock/stock.controlador.js

const stockServicio = require("./stock.servicio");
const articuloDepositoServicio = require("../articulo-deposito/articulo-deposito.servicio");

async function consultarStock(req, res) {
  try {
    const resultado = await stockServicio.consultarStock(req.query);
    return res.json(resultado);
  } catch (err) {
    console.error("Error al consultar stock:", err);
    return res.status(500).json({ error: "No se pudo consultar el stock." });
  }
}

// HU-7: actualizar stockMinimo/stockMaximo de un par articulo-deposito.
async function patchParametrosStock(req, res) {
  const articuloDepositoId = Number(req.params.articuloDepositoId);
  if (!Number.isInteger(articuloDepositoId)) {
    return res.status(400).json({ error: "articuloDepositoId invalido" });
  }

  const stockMinimo = Number(req.body?.stockMinimo);
  const stockMaximo = Number(req.body?.stockMaximo);
  if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
    return res.status(400).json({ error: "stockMinimo es obligatorio y debe ser un numero mayor o igual a 0" });
  }
  if (!Number.isFinite(stockMaximo) || stockMaximo < 0) {
    return res.status(400).json({ error: "stockMaximo es obligatorio y debe ser un numero mayor o igual a 0" });
  }
  if (stockMinimo >= stockMaximo) {
    return res.status(400).json({ error: "stockMinimo debe ser menor a stockMaximo" });
  }

  try {
    const habilitacion = await articuloDepositoServicio.obtenerHabilitacionPorId(articuloDepositoId);
    if (!habilitacion) {
      return res.status(404).json({ error: "Habilitacion no encontrada" });
    }
    const stock = await stockServicio.actualizarParametrosStock(articuloDepositoId, { stockMinimo, stockMaximo });
    return res.json(stock);
  } catch (err) {
    console.error("Error al actualizar parametros de stock:", err);
    return res.status(500).json({ error: "No se pudieron actualizar los parametros de stock." });
  }
}

module.exports = { consultarStock, patchParametrosStock };