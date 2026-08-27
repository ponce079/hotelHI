// src/modulos/articulo-deposito/articulo-deposito.controlador.js

const articulosServicio = require("../articulos/articulos.servicio");
const articuloDepositoServicio = require("./articulo-deposito.servicio");

// Habilita un articulo en uno o varios depositos (selector multiple, HU-4).
// No es todo-o-nada: por cada depositoId se informa si se creo, si la
// relacion ya existia (409 puntual, no de toda la request) o si el
// deposito no es valido (no existe / esta dado de baja).
async function postArticuloDeposito(req, res) {
  const { articuloId } = req.body ?? {};
  const depositoIds = Array.isArray(req.body?.depositoIds) ? [...new Set(req.body.depositoIds)] : [];

  if (!Number.isInteger(articuloId)) {
    return res.status(400).json({ error: "articuloId es obligatorio y debe ser numerico" });
  }
  if (depositoIds.length === 0 || !depositoIds.every(Number.isInteger)) {
    return res.status(400).json({ error: "depositoIds es obligatorio y debe ser una lista de numeros" });
  }

  try {
    const articulo = await articulosServicio.obtenerArticuloPorId(articuloId);
    if (!articulo) {
      return res.status(404).json({ error: `No existe un articulo con id ${articuloId}` });
    }
    if (!articulo.activo) {
      return res.status(400).json({ error: `El articulo ${articuloId} esta dado de baja, no se puede habilitar` });
    }

    const resultados = [];
    for (const depositoId of depositoIds) {
      const deposito = await articuloDepositoServicio.obtenerDepositoPorId(depositoId);
      if (!deposito) {
        resultados.push({ depositoId, estado: "no_encontrado" });
        continue;
      }
      if (!deposito.activo) {
        resultados.push({ depositoId, estado: "inactivo" });
        continue;
      }
      // Se busca el estado previo ANTES del upsert para poder distinguir
      // "creada" (par nuevo) de "reactivada" (existia pero estaba dado de
      // baja) de "ya_existia" (ya estaba activa, no cambio nada) — el
      // upsert por si solo no lo informa.
      const existente = await articuloDepositoServicio.buscarHabilitacion(articuloId, depositoId);
      await articuloDepositoServicio.habilitarArticuloEnDeposito({ articuloId, depositoId });
      if (!existente) {
        resultados.push({ depositoId, estado: "creada" });
      } else if (!existente.activo) {
        resultados.push({ depositoId, estado: "reactivada" });
      } else {
        resultados.push({ depositoId, estado: "ya_existia" });
      }
    }

    return res.status(201).json({ articuloId, resultados });
  } catch (err) {
    console.error("Error al habilitar articulo en depositos:", err);
    return res.status(500).json({ error: "No se pudo habilitar el articulo en los depositos." });
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

// Deshabilita o rehabilita el par articulo-deposito (HU-5). No borra stock:
// si hay unidades cargadas, la confirmacion explicita queda a cargo del
// frontend (el toggle aca no rechaza la baja, solo la aplica).
async function patchEstadoArticuloDeposito(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }
  const { activo } = req.body ?? {};
  if (typeof activo !== "boolean") {
    return res.status(400).json({ error: "activo es obligatorio y debe ser booleano" });
  }

  try {
    const existente = await articuloDepositoServicio.obtenerHabilitacionPorId(id);
    if (!existente) {
      return res.status(404).json({ error: "Habilitacion no encontrada" });
    }
    const habilitacion = await articuloDepositoServicio.cambiarEstadoHabilitacion(id, activo);
    return res.json(habilitacion);
  } catch (err) {
    console.error("Error al cambiar estado de la habilitacion:", err);
    return res.status(500).json({ error: "No se pudo cambiar el estado de la habilitacion." });
  }
}

module.exports = { postArticuloDeposito, getArticuloDepositos, patchEstadoArticuloDeposito };
