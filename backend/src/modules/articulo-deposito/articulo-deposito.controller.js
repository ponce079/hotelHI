import { obtenerArticuloPorId } from "../articulos/articulos.service.js";
import {
  habilitarArticuloEnDeposito,
  listarHabilitaciones,
  obtenerDepositoPorId,
} from "./articulo-deposito.service.js";

export async function postArticuloDeposito(req, res) {
  const { articuloId, depositoId } = req.body ?? {};

  if (!Number.isInteger(articuloId) || !Number.isInteger(depositoId)) {
    return res.status(400).json({ error: "articuloId y depositoId son obligatorios y deben ser numericos" });
  }

  const articulo = await obtenerArticuloPorId(articuloId);
  if (!articulo) {
    return res.status(404).json({ error: `No existe un articulo con id ${articuloId}` });
  }

  const deposito = await obtenerDepositoPorId(depositoId);
  if (!deposito) {
    return res.status(404).json({ error: `No existe un deposito con id ${depositoId}` });
  }

  try {
    const habilitacion = await habilitarArticuloEnDeposito({ articuloId, depositoId });
    res.status(201).json(habilitacion);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ error: `El articulo ${articuloId} ya esta habilitado en el deposito ${depositoId}` });
    }
    throw err;
  }
}

export async function getArticuloDepositos(_req, res) {
  const habilitaciones = await listarHabilitaciones();
  res.json(habilitaciones);
}
