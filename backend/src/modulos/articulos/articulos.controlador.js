// src/modulos/articulos/articulos.controlador.js

const { UNIDADES_MEDIDA, CATEGORIAS, NOMBRE_MAX_LENGTH, NOMBRE_REGEX } = require("./articulos.constantes");
const articulosServicio = require("./articulos.servicio");

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

  try {
    const articulo = await articulosServicio.crearArticulo({ nombre, unidadMedida, categoria });
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
  const { q, categoria, unidadMedida } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

  try {
    const resultado = await articulosServicio.listarArticulos({ q, categoria, unidadMedida, page, pageSize });
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

module.exports = { postArticulo, getArticulos, getArticuloPorId };
