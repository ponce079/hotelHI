// src/modulos/movimiento-salida/movimientoSalida.controlador.js
//
// Traduce HTTP <-> servicio. No tiene lógica de negocio, solo lee el
// request, llama al servicio, y arma la respuesta (o el error) correcta.

const movimientoSalidaServicio = require("./movimientoSalida.servicio");

async function registrarSalida(req, res) {
  try {
    const resultado = await movimientoSalidaServicio.registrarSalida(req.body);
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof movimientoSalidaServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al registrar movimiento de Salida:", err);
    return res.status(500).json({ error: "No se pudo registrar el movimiento de Salida." });
  }
}

module.exports = { registrarSalida };
