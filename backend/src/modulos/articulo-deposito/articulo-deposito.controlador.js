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
      try {
        await articuloDepositoServicio.habilitarArticuloEnDeposito({ articuloId, depositoId });
        resultados.push({ depositoId, estado: "creada" });
      } catch (err) {
        if (err.code === "P2002") {
          resultados.push({ depositoId, estado: "ya_existia" });
        } else {
          throw err;
        }
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

module.exports = { postArticuloDeposito, getArticuloDepositos };
