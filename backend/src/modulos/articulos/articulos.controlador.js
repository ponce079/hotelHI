// src/modulos/articulos/articulos.controlador.js

const { UNIDADES_MEDIDA, CATEGORIAS } = require("./articulos.constantes");
const articulosServicio = require("./articulos.servicio");

async function postArticulo(req, res) {
  const { codigo, descripcion, unidadMedida, categoria } = req.body ?? {};

  if (!codigo || !descripcion || !unidadMedida || !categoria) {
    return res.status(400).json({ error: "codigo, descripcion, unidadMedida y categoria son obligatorios" });
  }
  if (!UNIDADES_MEDIDA.includes(unidadMedida)) {
    return res.status(400).json({ error: `unidadMedida invalida. Valores permitidos: ${UNIDADES_MEDIDA.join(", ")}` });
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `categoria invalida. Valores permitidos: ${CATEGORIAS.join(", ")}` });
  }

  try {
    const articulo = await articulosServicio.crearArticulo({ codigo, descripcion, unidadMedida, categoria });
    return res.status(201).json(articulo);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un articulo con el codigo "${codigo}"` });
    }
    console.error("Error al crear articulo:", err);
    return res.status(500).json({ error: "No se pudo crear el articulo." });
  }
}

async function getArticulos(_req, res) {
  try {
    const articulos = await articulosServicio.listarArticulos();
    return res.json(articulos);
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
