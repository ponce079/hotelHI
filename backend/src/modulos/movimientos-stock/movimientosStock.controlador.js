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

async function getMovimientos(req, res) {
  try {
    const resultado = await movimientosStockServicio.listarMovimientos(req.query);
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar movimientos:", err);
    return res.status(500).json({ error: "No se pudieron listar los movimientos." });
  }
}

async function registrarTransferencia(req, res) {
  try {
    const resultado = await movimientosStockServicio.registrarTransferencia(req.body);
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof movimientosStockServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al registrar la transferencia:", err);
    return res.status(500).json({ error: "No se pudo registrar la transferencia." });
  }
}

async function postRecepcion(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }
  try {
    const resultado = await movimientosStockServicio.confirmarRecepcion(id, req.body);
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof movimientosStockServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al confirmar la recepcion:", err);
    return res.status(500).json({ error: "No se pudo confirmar la recepcion." });
  }
}

async function postRevisarDiferencia(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }
  try {
    const resultado = await movimientosStockServicio.marcarDiferenciaRevisada(id, req.body);
    return res.status(200).json(resultado);
  } catch (err) {
    if (err instanceof movimientosStockServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al marcar la diferencia como revisada:", err);
    return res.status(500).json({ error: "No se pudo marcar la diferencia como revisada." });
  }
}

async function postPedirFaltantes(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }
  try {
    const resultado = await movimientosStockServicio.pedirFaltantesPorDiferencia(id, req.body);
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof movimientosStockServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al pedir los faltantes de la diferencia:", err);
    return res.status(500).json({ error: "No se pudo generar el pedido de los faltantes." });
  }
}

module.exports = {
  registrarEntrada,
  getMovimientos,
  registrarTransferencia,
  postRecepcion,
  postRevisarDiferencia,
  postPedirFaltantes,
};