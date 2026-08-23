// src/modulos/tipos-movimiento/tiposMovimiento.controlador.js
//
// Traduce HTTP <-> servicio. Valida que "tipo" solo admita 'E' o 'S'
// (Definition of Done de HU-10).

const { TIPOS_VALIDOS, DESCRIPCION_MAX_LENGTH, DESCRIPCION_REGEX } = require("./tiposMovimiento.constantes");
const tiposMovimientoServicio = require("./tiposMovimiento.servicio");

async function postTipoMovimiento(req, res) {
  const { tipo } = req.body ?? {};
  const descripcion =
    typeof req.body?.descripcion === "string" ? req.body.descripcion.trim().toUpperCase() : req.body?.descripcion;

  if (!descripcion || !tipo) {
    return res.status(400).json({ error: "descripcion y tipo son obligatorios" });
  }
  if (descripcion.length > DESCRIPCION_MAX_LENGTH) {
    return res.status(400).json({ error: `descripcion no puede superar los ${DESCRIPCION_MAX_LENGTH} caracteres` });
  }
  if (!DESCRIPCION_REGEX.test(descripcion)) {
    return res.status(400).json({ error: "descripcion solo puede contener letras, números y espacios" });
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `tipo invalido. Valores permitidos: ${TIPOS_VALIDOS.join(", ")}` });
  }

  try {
    const tipoMovimiento = await tiposMovimientoServicio.crearTipoMovimiento({ descripcion, tipo });
    return res.status(201).json(tipoMovimiento);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un tipo de movimiento con la descripcion "${descripcion}"` });
    }
    console.error("Error al crear tipo de movimiento:", err);
    return res.status(500).json({ error: "No se pudo crear el tipo de movimiento." });
  }
}

async function getTiposMovimiento(_req, res) {
  try {
    const tipos = await tiposMovimientoServicio.listarTiposMovimiento();
    return res.json(tipos);
  } catch (err) {
    console.error("Error al listar tipos de movimiento:", err);
    return res.status(500).json({ error: "No se pudieron listar los tipos de movimiento." });
  }
}

module.exports = { postTipoMovimiento, getTiposMovimiento };
