// src/modulos/requerimientos/requerimientos.controlador.js

const { ESTADOS_REQUERIMIENTO, ORIGENES_REQUERIMIENTO } = require("../../lib/constantes");
const requerimientosServicio = require("./requerimientos.servicio");
const presupuestosServicio = require("../presupuestos/presupuestos.servicio");

function manejarError(res, err, mensajeGenerico) {
  if (err instanceof requerimientosServicio.ErrorDeNegocio || err instanceof presupuestosServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(mensajeGenerico, err);
  return res.status(500).json({ error: mensajeGenerico });
}

async function postRequerimiento(req, res) {
  const depositoId = Number(req.body?.depositoId);
  const origen = req.body?.origen ?? ORIGENES_REQUERIMIENTO.MANUAL;
  const { solicitante, detalle } = req.body ?? {};

  if (!Number.isInteger(depositoId)) {
    return res.status(400).json({ error: "depositoId es obligatorio" });
  }
  if (!Object.values(ORIGENES_REQUERIMIENTO).includes(origen)) {
    return res.status(400).json({
      error: `origen inválido. Valores permitidos: ${Object.values(ORIGENES_REQUERIMIENTO).join(", ")}`,
    });
  }
  if (!Array.isArray(detalle) || detalle.length === 0) {
    return res.status(400).json({ error: "Cargá al menos un artículo en el detalle" });
  }

  const lineas = [];
  for (const linea of detalle) {
    const articuloId = Number(linea?.articuloId);
    const cantidadSolicitada = Number(linea?.cantidadSolicitada);
    if (!Number.isInteger(articuloId)) {
      return res.status(400).json({ error: "Cada línea del detalle necesita un articuloId válido" });
    }
    if (!Number.isFinite(cantidadSolicitada) || cantidadSolicitada <= 0) {
      return res.status(400).json({ error: "La cantidad solicitada tiene que ser mayor a 0" });
    }
    lineas.push({ articuloId, cantidadSolicitada });
  }

  try {
    const requerimiento = await requerimientosServicio.crearRequerimiento({
      depositoId,
      origen,
      solicitante: typeof solicitante === "string" ? solicitante.trim() : null,
      detalle: lineas,
    });
    return res.status(201).json(requerimiento);
  } catch (err) {
    return manejarError(res, err, "No se pudo crear el requerimiento.");
  }
}

async function getRequerimientos(req, res) {
  const { estado, depositoId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

  if (estado && !Object.values(ESTADOS_REQUERIMIENTO).includes(estado)) {
    return res.status(400).json({
      error: `estado inválido. Valores permitidos: ${Object.values(ESTADOS_REQUERIMIENTO).join(", ")}`,
    });
  }

  try {
    const resultado = await requerimientosServicio.listarRequerimientos({ estado, depositoId, page, pageSize });
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar requerimientos:", err);
    return res.status(500).json({ error: "No se pudieron listar los requerimientos." });
  }
}

async function getRequerimientoPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const requerimiento = await requerimientosServicio.obtenerRequerimientoPorId(id);
    if (!requerimiento) return res.status(404).json({ error: "Requerimiento no encontrado" });
    return res.json(requerimiento);
  } catch (err) {
    console.error("Error al obtener requerimiento:", err);
    return res.status(500).json({ error: "No se pudo obtener el requerimiento." });
  }
}

// HU-82. La ruta cuelga de /api/requerimientos porque la acción es sobre
// el requerimiento, pero la lógica vive en presupuestos.servicio.js (es
// el que crea las filas Presupuesto).
async function postSolicitarPresupuestos(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const { proveedorIds, requiereFlete } = req.body ?? {};
  if (!Array.isArray(proveedorIds) || proveedorIds.length === 0) {
    return res.status(400).json({ error: "Elegí al menos un proveedor para pedirle presupuesto" });
  }
  if (proveedorIds.some((p) => !Number.isInteger(Number(p)))) {
    return res.status(400).json({ error: "proveedorIds tiene que ser una lista de ids numéricos" });
  }

  try {
    const resultado = await presupuestosServicio.solicitarPresupuestos(id, {
      proveedorIds: proveedorIds.map(Number),
      requiereFlete: Boolean(requiereFlete),
    });
    return res.status(201).json(resultado);
  } catch (err) {
    return manejarError(res, err, "No se pudieron solicitar los presupuestos.");
  }
}

module.exports = { postRequerimiento, getRequerimientos, getRequerimientoPorId, postSolicitarPresupuestos };
