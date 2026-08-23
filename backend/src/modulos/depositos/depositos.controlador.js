// src/modulos/depositos/depositos.controlador.js
//
// Traduce HTTP <-> servicio. Nombre, ubicacion y responsable son
// obligatorios en el alta segun el Definition of Done de HU-3, aunque en
// el schema queden como String? (igual patron que unidadMedida/categoria
// de Articulo: la obligatoriedad se valida en la app, no en la base).

const {
  UBICACIONES,
  NOMBRE_MAX_LENGTH,
  RESPONSABLE_MAX_LENGTH,
  NOMBRE_REGEX,
  RESPONSABLE_REGEX,
} = require("./depositos.constantes");
const depositosServicio = require("./depositos.servicio");

async function postDeposito(req, res) {
  const { ubicacion } = req.body ?? {};
  const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim().toUpperCase() : req.body?.nombre;
  const responsable =
    typeof req.body?.responsable === "string" ? req.body.responsable.trim() : req.body?.responsable;

  if (!nombre || !ubicacion || !responsable) {
    return res.status(400).json({ error: "nombre, ubicacion y responsable son obligatorios" });
  }
  if (nombre.length > NOMBRE_MAX_LENGTH) {
    return res.status(400).json({ error: `nombre no puede superar los ${NOMBRE_MAX_LENGTH} caracteres` });
  }
  if (!NOMBRE_REGEX.test(nombre)) {
    return res.status(400).json({ error: "nombre solo puede contener letras, números y espacios" });
  }
  if (!UBICACIONES.includes(ubicacion)) {
    return res.status(400).json({ error: `ubicacion invalida. Valores permitidos: ${UBICACIONES.join(", ")}` });
  }
  if (responsable.length > RESPONSABLE_MAX_LENGTH) {
    return res.status(400).json({ error: `responsable no puede superar los ${RESPONSABLE_MAX_LENGTH} caracteres` });
  }
  if (!RESPONSABLE_REGEX.test(responsable)) {
    return res.status(400).json({ error: "responsable solo puede contener letras y espacios" });
  }

  try {
    const deposito = await depositosServicio.crearDeposito({ nombre, ubicacion, responsable });
    return res.status(201).json(deposito);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un deposito con el nombre "${nombre}"` });
    }
    console.error("Error al crear deposito:", err);
    return res.status(500).json({ error: "No se pudo crear el deposito." });
  }
}

async function getDepositos(_req, res) {
  try {
    const depositos = await depositosServicio.listarDepositos();
    return res.json(depositos);
  } catch (err) {
    console.error("Error al listar depositos:", err);
    return res.status(500).json({ error: "No se pudieron listar los depositos." });
  }
}

async function getDepositoPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }

  try {
    const deposito = await depositosServicio.obtenerDepositoPorId(id);
    if (!deposito) {
      return res.status(404).json({ error: "Deposito no encontrado" });
    }
    return res.json(deposito);
  } catch (err) {
    console.error("Error al obtener deposito:", err);
    return res.status(500).json({ error: "No se pudo obtener el deposito." });
  }
}

module.exports = { postDeposito, getDepositos, getDepositoPorId };
