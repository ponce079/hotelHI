import { UNIDADES_MEDIDA, CATEGORIAS } from "./articulos.constants.js";
import { crearArticulo, listarArticulos, obtenerArticuloPorId } from "./articulos.service.js";

export async function postArticulo(req, res) {
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
    const articulo = await crearArticulo({ codigo, descripcion, unidadMedida, categoria });
    res.status(201).json(articulo);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un articulo con el codigo "${codigo}"` });
    }
    throw err;
  }
}

export async function getArticulos(_req, res) {
  const articulos = await listarArticulos();
  res.json(articulos);
}

export async function getArticuloPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }

  const articulo = await obtenerArticuloPorId(id);
  if (!articulo) {
    return res.status(404).json({ error: "Articulo no encontrado" });
  }
  res.json(articulo);
}
