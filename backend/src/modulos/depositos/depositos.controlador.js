// src/modulos/depositos/depositos.controlador.js
//
// Traduce HTTP <-> servicio. Nombre, ubicacion y responsable son
// obligatorios en el alta segun el Definition of Done de HU-3, aunque en
// el schema queden como String? (igual patron que unidadMedida/categoria
// de Articulo: la obligatoriedad se valida en la app, no en la base).

const {
  NOMBRE_MAX_LENGTH,
  RESPONSABLE_MAX_LENGTH,
  UBICACION_MAX_LENGTH,
  NOMBRE_REGEX,
  RESPONSABLE_REGEX,
  UBICACION_REGEX,
} = require("./depositos.constantes");
const depositosServicio = require("./depositos.servicio");

// Compartida por alta y edicion: normaliza y valida {nombre, ubicacion,
// responsable}. Devuelve { error } si algo no es valido, o { nombre,
// ubicacion, responsable } normalizados si esta todo bien.
function normalizarYValidar(body) {
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().toUpperCase() : body?.nombre;
  const ubicacion = typeof body?.ubicacion === "string" ? body.ubicacion.trim() : body?.ubicacion;
  const responsable = typeof body?.responsable === "string" ? body.responsable.trim() : body?.responsable;

  if (!nombre || !ubicacion || !responsable) {
    return { error: "nombre, ubicacion y responsable son obligatorios" };
  }
  if (nombre.length > NOMBRE_MAX_LENGTH) {
    return { error: `nombre no puede superar los ${NOMBRE_MAX_LENGTH} caracteres` };
  }
  if (!NOMBRE_REGEX.test(nombre)) {
    return { error: "nombre solo puede contener letras, números y espacios" };
  }
  if (ubicacion.length > UBICACION_MAX_LENGTH) {
    return { error: `ubicacion no puede superar los ${UBICACION_MAX_LENGTH} caracteres` };
  }
  if (!UBICACION_REGEX.test(ubicacion)) {
    return { error: "ubicacion solo puede contener letras, números y espacios" };
  }
  if (responsable.length > RESPONSABLE_MAX_LENGTH) {
    return { error: `responsable no puede superar los ${RESPONSABLE_MAX_LENGTH} caracteres` };
  }
  if (!RESPONSABLE_REGEX.test(responsable)) {
    return { error: "responsable solo puede contener letras y espacios" };
  }
  const esCentral = Boolean(body?.esCentral);
  return { nombre, ubicacion, responsable, esCentral };
}

async function postDeposito(req, res) {
  const validado = normalizarYValidar(req.body);
  if (validado.error) {
    return res.status(400).json({ error: validado.error });
  }
  const { nombre, ubicacion, responsable, esCentral } = validado;

  try {
    const deposito = await depositosServicio.crearDeposito({ nombre, ubicacion, responsable, esCentral });
    const advertencia = await advertenciaCentral(esCentral, null);
    return res.status(201).json({ ...deposito, advertencia });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un deposito con el nombre "${nombre}"` });
    }
    console.error("Error al crear deposito:", err);
    return res.status(500).json({ error: "No se pudo crear el deposito." });
  }
}

// Sprint 3: el diseño espera 1 o 2 depósitos centrales, pero no es un límite
// duro — el ABM avisa en vez de bloquear si ya hay otros marcados.
async function advertenciaCentral(esCentral, idPropio) {
  if (!esCentral) return null;
  const otros = await depositosServicio.contarCentrales(idPropio);
  if (otros >= 2) {
    return `Ya hay ${otros} depósitos marcados como centrales. Se esperan 1 o 2 — revisá si esto es intencional.`;
  }
  return null;
}

async function putDeposito(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalido" });
  }

  const validado = normalizarYValidar(req.body);
  if (validado.error) {
    return res.status(400).json({ error: validado.error });
  }
  const { nombre, ubicacion, responsable, esCentral } = validado;

  try {
    const existente = await depositosServicio.obtenerDepositoPorId(id);
    if (!existente) {
      return res.status(404).json({ error: "Deposito no encontrado" });
    }
    const deposito = await depositosServicio.actualizarDeposito(id, { nombre, ubicacion, responsable, esCentral });
    const advertencia = await advertenciaCentral(esCentral, id);
    return res.json({ ...deposito, advertencia });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `Ya existe un deposito con el nombre "${nombre}"` });
    }
    console.error("Error al actualizar deposito:", err);
    return res.status(500).json({ error: "No se pudo actualizar el deposito." });
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

module.exports = { postDeposito, getDepositos, getDepositoPorId, putDeposito };
