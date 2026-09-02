// src/modulos/pagos/pagos.controlador.js
//
// Traduce HTTP <-> servicio. No tiene lógica de negocio, solo lee el
// request, llama al servicio, y arma la respuesta (o el error) correcta.

const pagosServicio = require("./pagos.servicio");

async function getProveedoresConSaldo(req, res) {
  try {
    const resultado = await pagosServicio.proveedoresConSaldo();
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar proveedores con saldo:", err);
    return res.status(500).json({ error: "No se pudieron listar los proveedores con saldo pendiente." });
  }
}

async function getComprobantesPendientes(req, res) {
  try {
    const resultado = await pagosServicio.comprobantesPendientes(req.query.proveedorId);
    return res.json(resultado);
  } catch (err) {
    if (err instanceof pagosServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Error al listar comprobantes pendientes:", err);
    return res.status(500).json({ error: "No se pudieron listar los comprobantes pendientes." });
  }
}

async function postOrdenPago(req, res) {
  try {
    const resultado = await pagosServicio.crearOrdenPago(req.body ?? {});
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof pagosServicio.ErrorDeNegocio) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un cheque con ese número para ese banco." });
    }
    console.error("Error al crear la orden de pago:", err);
    return res.status(500).json({ error: "No se pudo crear la orden de pago." });
  }
}

async function getOrdenPagoPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }
  try {
    const orden = await pagosServicio.obtenerOrdenPago(id);
    if (!orden) {
      return res.status(404).json({ error: "Orden de pago no encontrada" });
    }
    return res.json(orden);
  } catch (err) {
    console.error("Error al obtener la orden de pago:", err);
    return res.status(500).json({ error: "No se pudo obtener la orden de pago." });
  }
}

module.exports = { getProveedoresConSaldo, getComprobantesPendientes, postOrdenPago, getOrdenPagoPorId };
