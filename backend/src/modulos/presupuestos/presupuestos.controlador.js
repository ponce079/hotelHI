// src/modulos/presupuestos/presupuestos.controlador.js

const { ESTADOS_PRESUPUESTO } = require("../../lib/constantes");
const presupuestosServicio = require("./presupuestos.servicio");

function manejarError(res, err, mensajeGenerico) {
  if (err instanceof presupuestosServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  // El @@unique(requerimientoId, proveedorId) del schema es el que impide
  // invitar dos veces al mismo proveedor para el mismo requerimiento.
  if (err.code === "P2002") {
    return res.status(409).json({ error: "Ese proveedor ya tiene un presupuesto para este requerimiento" });
  }
  console.error(mensajeGenerico, err);
  return res.status(500).json({ error: mensajeGenerico });
}

async function getPresupuestos(req, res) {
  const { requerimientoId, proveedorId, estado } = req.query;
  if (estado && !Object.values(ESTADOS_PRESUPUESTO).includes(estado)) {
    return res.status(400).json({
      error: `estado inválido. Valores permitidos: ${Object.values(ESTADOS_PRESUPUESTO).join(", ")}`,
    });
  }

  try {
    const resultado = await presupuestosServicio.listarPresupuestos({ requerimientoId, proveedorId, estado });
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar presupuestos:", err);
    return res.status(500).json({ error: "No se pudieron listar los presupuestos." });
  }
}

async function getPresupuestoPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const presupuesto = await presupuestosServicio.obtenerPresupuestoPorId(id);
    if (!presupuesto) return res.status(404).json({ error: "Presupuesto no encontrado" });
    return res.json(presupuesto);
  } catch (err) {
    console.error("Error al obtener presupuesto:", err);
    return res.status(500).json({ error: "No se pudo obtener el presupuesto." });
  }
}

// HU-83 — cargar la cotización que mandó el proveedor.
async function putCargarPresupuesto(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const { precios, plazoEntrega, costoFlete } = req.body ?? {};
  if (!Array.isArray(precios) || precios.length === 0) {
    return res.status(400).json({ error: "Cargá el precio unitario de cada artículo" });
  }

  const lineas = [];
  for (const linea of precios) {
    const articuloId = Number(linea?.articuloId);
    const precioUnitario = Number(linea?.precioUnitario);
    if (!Number.isInteger(articuloId)) {
      return res.status(400).json({ error: "Cada precio necesita un articuloId válido" });
    }
    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      return res.status(400).json({ error: "Cada precio unitario tiene que ser mayor a 0" });
    }
    lineas.push({ articuloId, precioUnitario });
  }

  let flete = null;
  if (costoFlete !== undefined && costoFlete !== null && costoFlete !== "") {
    flete = Number(costoFlete);
    if (!Number.isFinite(flete) || flete < 0) {
      return res.status(400).json({ error: "El costo de flete no puede ser negativo" });
    }
  }

  try {
    const presupuesto = await presupuestosServicio.cargarPresupuesto(id, {
      precios: lineas,
      plazoEntrega,
      costoFlete: flete,
    });
    return res.json(presupuesto);
  } catch (err) {
    return manejarError(res, err, "No se pudo cargar el presupuesto.");
  }
}

// HU-84 — adjudicar. El rol gerente se chequea en el frontend (no hay
// auth real hasta Sprint 3, ver frontend/src/lib/sesion.jsx).
async function postAprobarPresupuesto(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const usuario = typeof req.body?.usuario === "string" ? req.body.usuario.trim() : null;

  try {
    const presupuesto = await presupuestosServicio.aprobarPresupuesto(id, usuario);
    return res.json(presupuesto);
  } catch (err) {
    return manejarError(res, err, "No se pudo aprobar el presupuesto.");
  }
}

module.exports = { getPresupuestos, getPresupuestoPorId, putCargarPresupuesto, postAprobarPresupuesto };
