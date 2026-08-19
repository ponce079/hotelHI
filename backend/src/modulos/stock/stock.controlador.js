// src/modulos/stock/stock.controlador.js

const stockServicio = require("./stock.servicio");

async function consultarStock(req, res) {
  try {
    const resultado = await stockServicio.consultarStock(req.query);
    return res.json(resultado);
  } catch (err) {
    console.error("Error al consultar stock:", err);
    return res.status(500).json({ error: "No se pudo consultar el stock." });
  }
}

module.exports = { consultarStock };