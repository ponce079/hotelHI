// src/modulos/movimientos-stock/movimientosStock.controlador.js
//
// Traduce HTTP <-> servicio. No tiene lógica de negocio, solo lee el
// request, llama al servicio, y arma la respuesta (o el error) correcta.

const movimientosStockServicio = require("./movimientosStock.servicio");

async function registrarEntrada(req, res) {
  try {
    const resultado = await movimientosStockServicio.registrarEntrada(req.body);
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof movimientosStockServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al registrar movimiento de Entrada:", err);
    return res.status(500).json({ error: "No se pudo registrar el movimiento de Entrada." });
  }
}

module.exports = { registrarEntrada };