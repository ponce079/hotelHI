// src/modulos/articulo-deposito/articulo-deposito.controlador.js

const articulosServicio = require("../articulos/articulos.servicio");
const articuloDepositoServicio = require("./articulo-deposito.servicio");

async function postArticuloDeposito(req, res) {
  const { articuloId, depositoId } = req.body ?? {};

  if (!Number.isInteger(articuloId) || !Number.isInteger(depositoId)) {
    return res.status(400).json({ error: "articuloId y depositoId son obligatorios y deben ser numericos" });
  }

  try {
    const articulo = await articulosServicio.obtenerArticuloPorId(articuloId);
    if (!articulo) {
      return res.status(404).json({ error: `No existe un articulo con id ${articuloId}` });
    }

    const deposito = await articuloDepositoServicio.obtenerDepositoPorId(depositoId);
    if (!deposito) {
      return res.status(404).json({ error: `No existe un deposito con id ${depositoId}` });
    }

    const habilitacion = await articuloDepositoServicio.habilitarArticuloEnDeposito({ articuloId, depositoId });
    return res.status(201).json(habilitacion);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ error: `El articulo ${articuloId} ya esta habilitado en el deposito ${depositoId}` });
    }
    console.error("Error al habilitar articulo en deposito:", err);
    return res.status(500).json({ error: "No se pudo habilitar el articulo en el deposito." });
  }
}

async function getArticuloDepositos(_req, res) {
  try {
    const habilitaciones = await articuloDepositoServicio.listarHabilitaciones();
    return res.json(habilitaciones);
  } catch (err) {
    console.error("Error al listar habilitaciones:", err);
    return res.status(500).json({ error: "No se pudieron listar las habilitaciones." });
  }
}

module.exports = { postArticuloDeposito, getArticuloDepositos };
