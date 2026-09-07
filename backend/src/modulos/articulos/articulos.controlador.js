// src/modulos/articulos/articulos.controlador.js

const { UNIDADES_MEDIDA, CATEGORIAS, NOMBRE_MAX_LENGTH, NOMBRE_REGEX, MODOS_REPOSICION } = require("./articulos.constantes");
const articulosServicio = require("./articulos.servicio");

// Compartido por alta y edicion: normaliza y valida depositoCentralId (opcional,
// entero o null) y modoReposicion (default SUGERIDA). Devuelve { error } o los
// valores normalizados.
function normalizarReposicion(body) {
  const modoReposicion = body?.modoReposicion ?? "SUGERIDA";
  if (!MODOS_REPOSICION.includes(modoReposicion)) {
    return { error: `modoReposicion invalida. Valores permitidos: ${MODOS_REPOSICION.join(", ")}` };
  }
  let depositoCentralId = null;
  if (body?.depositoCentralId != null && body.depositoCentralId !== "") {
    depositoCentralId = Number(body.depositoCentralId);
    if (!Number.isInteger(depositoCentralId)) {
      return { error: "depositoCentralId invalido" };
    }
  }
  return { depositoCentralId, modoReposicion };
}

async function postArticulo(req, res) {
  const { unidadMedida, categoria } = req.body ?? {};
  const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim().toUpperCase() : req.body?.nombre;

  if (!nombre || !unidadMedida || !categoria) {
    return res.status(400).json({ error: "nombre, unidadMedida y categoria son obligatorios" });
  }
  if (nombre.length > NOMBRE_MAX_LENGTH) {
    return res.status(400).json({ error: `nombre no puede superar los ${NOMBRE_MAX_LENGTH} caracteres` });
  }
  if (!NOMBRE_REGEX.test(nombre)) {
    return res.status(400).json({ error: "nombre solo puede contener letras, números y espacios" });
  }
  if (!UNIDADES_MEDIDA.includes(unidadMedida)) {
    return res.status(400).json({ error: `unidadMedida invalida. Valores permitidos: ${UNIDADES_MEDIDA.join(", ")}` });
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `categoria invalida. Valores permitidos: ${CATEGORIAS.join(", ")}` });
  }
  const reposicion = normalizarReposicion(req.body);
  if (reposicion.error) {
    return res.status(400).json({ error: reposicion.error });
  }
  const errorCentral = await articulosServicio.validarDepositoCentral(reposicion.depositoCentralId);
  if (errorCentral) {
    return res.status(400).json({ error: errorCentral });
  }

  try {
    const articulo = await articulosServicio.crearArticulo({
      nombre,
      unidadMedida,
      categoria,
      depositoCentralId: reposicion.depositoCentralId,
      modoReposicion: reposicion.modoReposicion,
    });
    return res.status(201).json(articulo);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un articulo con el nombre "${nombre}"` });
    }
    console.error("Error al crear articulo:", err);
    return res.status(500).json({ error: "No se pudo crear el articulo." });
  }
}

async function getArticulos(req, res) {
  const { q, categoria, unidadMedida, estado } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

  try {
    const resultado = await articulosServicio.listarArticulos({ q, categoria, unidadMedida, estado, page, pageSize });
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar articulos:", err);
    return res.status(500).json({ error: "No se pudieron listar los articulos." });
  }
}

async function getArticuloPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }

  try {
    const articulo = await articulosServicio.obtenerArticuloPorId(id);
    if (!articulo) {
      return res.status(404).json({ error: "Articulo no encontrado" });
    }
    return res.json(articulo);
  } catch (err) {
    console.error("Error al obtener articulo:", err);
    return res.status(500).json({ error: "No se pudo obtener el articulo." });
  }
}

async function putArticulo(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }

  const { unidadMedida, categoria } = req.body ?? {};
  const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim().toUpperCase() : req.body?.nombre;

  if (!nombre || !unidadMedida || !categoria) {
    return res.status(400).json({ error: "nombre, unidadMedida y categoria son obligatorios" });
  }
  if (nombre.length > NOMBRE_MAX_LENGTH) {
    return res.status(400).json({ error: `nombre no puede superar los ${NOMBRE_MAX_LENGTH} caracteres` });
  }
  if (!NOMBRE_REGEX.test(nombre)) {
    return res.status(400).json({ error: "nombre solo puede contener letras, números y espacios" });
  }
  if (!UNIDADES_MEDIDA.includes(unidadMedida)) {
    return res.status(400).json({ error: `unidadMedida invalida. Valores permitidos: ${UNIDADES_MEDIDA.join(", ")}` });
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `categoria invalida. Valores permitidos: ${CATEGORIAS.join(", ")}` });
  }
  const reposicion = normalizarReposicion(req.body);
  if (reposicion.error) {
    return res.status(400).json({ error: reposicion.error });
  }
  const errorCentral = await articulosServicio.validarDepositoCentral(reposicion.depositoCentralId);
  if (errorCentral) {
    return res.status(400).json({ error: errorCentral });
  }

  try {
    const existente = await articulosServicio.obtenerArticuloPorId(id);
    if (!existente) {
      return res.status(404).json({ error: "Articulo no encontrado" });
    }
    const articulo = await articulosServicio.actualizarArticulo(id, {
      nombre,
      unidadMedida,
      categoria,
      depositoCentralId: reposicion.depositoCentralId,
      modoReposicion: reposicion.modoReposicion,
    });
    return res.json(articulo);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un articulo con el nombre "${nombre}"` });
    }
    console.error("Error al editar articulo:", err);
    return res.status(500).json({ error: "No se pudo editar el articulo." });
  }
}

async function patchEstadoArticulo(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }
  const { activo } = req.body ?? {};
  if (typeof activo !== "boolean") {
    return res.status(400).json({ error: "activo es obligatorio y debe ser booleano" });
  }

  try {
    const existente = await articulosServicio.obtenerArticuloPorId(id);
    if (!existente) {
      return res.status(404).json({ error: "Articulo no encontrado" });
    }
    const articulo = await articulosServicio.cambiarEstadoArticulo(id, activo);
    return res.json(articulo);
  } catch (err) {
    console.error("Error al cambiar estado del articulo:", err);
    return res.status(500).json({ error: "No se pudo cambiar el estado del articulo." });
  }
}

module.exports = { postArticulo, getArticulos, getArticuloPorId, putArticulo, patchEstadoArticulo };
