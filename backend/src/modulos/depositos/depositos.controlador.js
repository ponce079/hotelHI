// src/modulos/depositos/depositos.controlador.js
//
// Traduce HTTP <-> servicio. Nombre, ubicacion y responsable son
// obligatorios en el alta segun el Definition of Done de HU-3, aunque en
// el schema queden como String? (igual patron que unidadMedida/categoria
// de Articulo: la obligatoriedad se valida en la app, no en la base).

const depositosServicio = require("./depositos.servicio");

async function postDeposito(req, res) {
  const { nombre, ubicacion, responsable } = req.body ?? {};

  if (!nombre || !ubicacion || !responsable) {
    return res.status(400).json({ error: "nombre, ubicacion y responsable son obligatorios" });
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
