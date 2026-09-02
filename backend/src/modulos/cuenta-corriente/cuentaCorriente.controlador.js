// src/modulos/cuenta-corriente/cuentaCorriente.controlador.js

const cuentaCorrienteServicio = require("./cuentaCorriente.servicio");

async function getCuentaCorriente(req, res) {
  try {
    const resultado = await cuentaCorrienteServicio.cuentaCorrienteDeProveedor(req.params.id, req.query);
    return res.json(resultado);
  } catch (err) {
    if (err instanceof cuentaCorrienteServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al obtener la cuenta corriente:", err);
    return res.status(500).json({ error: "No se pudo obtener la cuenta corriente." });
  }
}

async function getResumen(req, res) {
  try {
    const resultado = await cuentaCorrienteServicio.resumenCuentaCorriente();
    return res.json(resultado);
  } catch (err) {
    console.error("Error al obtener el resumen de cuenta corriente:", err);
    return res.status(500).json({ error: "No se pudo obtener el resumen de cuenta corriente." });
  }
}

module.exports = { getCuentaCorriente, getResumen };
