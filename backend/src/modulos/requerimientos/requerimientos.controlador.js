// src/modulos/requerimientos/requerimientos.controlador.js

const {
  ESTADOS_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  TIPOS_REQUERIMIENTO,
  CATEGORIAS_REQUERIMIENTO,
} = require("../../lib/constantes");
const requerimientosServicio = require("./requerimientos.servicio");
const presupuestosServicio = require("../presupuestos/presupuestos.servicio");

function manejarError(res, err, mensajeGenerico) {
  if (err instanceof requerimientosServicio.ErrorDeNegocio || err instanceof presupuestosServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(mensajeGenerico, err);
  return res.status(500).json({ error: mensajeGenerico });
}

// Compartido por alta y edición: misma forma de detalle en los dos casos.
// Devuelve { error } o { lineas }, nunca los dos — el caller decide qué
// hacer con cada uno (evita repetir el resto de la validación).
function validarDetalle(detalle) {
  if (!Array.isArray(detalle) || detalle.length === 0) {
    return { error: "Cargá al menos un artículo en el detalle" };
  }
  const lineas = [];
  for (const linea of detalle) {
    const articuloId = Number(linea?.articuloId);
    const cantidadSolicitada = Number(linea?.cantidadSolicitada);
    if (!Number.isInteger(articuloId)) {
      return { error: "Cada línea del detalle necesita un articuloId válido" };
    }
    if (!Number.isFinite(cantidadSolicitada) || cantidadSolicitada <= 0) {
      return { error: "La cantidad solicitada tiene que ser mayor a 0" };
    }
    lineas.push({ articuloId, cantidadSolicitada });
  }
  return { lineas };
}

async function postRequerimiento(req, res) {
  const depositoId = Number(req.body?.depositoId);
  const origen = req.body?.origen ?? ORIGENES_REQUERIMIENTO.MANUAL;
  const tipo = req.body?.tipo ?? TIPOS_REQUERIMIENTO.COMPRA;
  const { solicitante, detalle, urgente } = req.body ?? {};

  if (!Number.isInteger(depositoId)) {
    return res.status(400).json({ error: "depositoId es obligatorio" });
  }
  if (!Object.values(ORIGENES_REQUERIMIENTO).includes(origen)) {
    return res.status(400).json({
      error: `origen inválido. Valores permitidos: ${Object.values(ORIGENES_REQUERIMIENTO).join(", ")}`,
    });
  }
  if (!Object.values(TIPOS_REQUERIMIENTO).includes(tipo)) {
    return res.status(400).json({
      error: `tipo inválido. Valores permitidos: ${Object.values(TIPOS_REQUERIMIENTO).join(", ")}`,
    });
  }
  const { error, lineas } = validarDetalle(detalle);
  if (error) return res.status(400).json({ error });

  try {
    const requerimiento = await requerimientosServicio.crearRequerimiento({
      depositoId,
      origen,
      tipo,
      urgente: Boolean(urgente),
      solicitante: typeof solicitante === "string" ? solicitante.trim() : null,
      detalle: lineas,
    });
    return res.status(201).json(requerimiento);
  } catch (err) {
    return manejarError(res, err, "No se pudo crear el requerimiento.");
  }
}

async function getRequerimientos(req, res) {
  const { estado, categoria, depositoId, tipo, q } = req.query;
  const urgente = req.query.urgente === "1" || req.query.urgente === "true";
  const soloAbiertas = req.query.soloAbiertas === "1" || req.query.soloAbiertas === "true";
  const incluirAnulados = req.query.incluirAnulados === "1" || req.query.incluirAnulados === "true";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

  if (estado && !Object.values(ESTADOS_REQUERIMIENTO).includes(estado)) {
    return res.status(400).json({
      error: `estado inválido. Valores permitidos: ${Object.values(ESTADOS_REQUERIMIENTO).join(", ")}`,
    });
  }
  if (categoria && !Object.values(CATEGORIAS_REQUERIMIENTO).includes(categoria)) {
    return res.status(400).json({
      error: `categoria inválida. Valores permitidos: ${Object.values(CATEGORIAS_REQUERIMIENTO).join(", ")}`,
    });
  }
  if (tipo && !Object.values(TIPOS_REQUERIMIENTO).includes(tipo)) {
    return res.status(400).json({
      error: `tipo inválido. Valores permitidos: ${Object.values(TIPOS_REQUERIMIENTO).join(", ")}`,
    });
  }

  try {
    const resultado = await requerimientosServicio.listarRequerimientos({
      // `estado` (dropdown puntual) y `categoria` (tarjetas de resumen)
      // son mutuamente excluyentes: si llegan los dos, gana `estado` — es
      // el filtro más específico.
      estado: estado || undefined,
      categoria: estado ? undefined : categoria || undefined,
      depositoId,
      tipo,
      q,
      urgente,
      soloAbiertas,
      incluirAnulados,
      page,
      pageSize,
    });
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar requerimientos:", err);
    return res.status(500).json({ error: "No se pudieron listar los requerimientos." });
  }
}

// Rediseño de la pantalla — los 4 contadores de las tarjetas de resumen.
async function getResumen(req, res) {
  const { depositoId, tipo, q } = req.query;
  if (tipo && !Object.values(TIPOS_REQUERIMIENTO).includes(tipo)) {
    return res.status(400).json({
      error: `tipo inválido. Valores permitidos: ${Object.values(TIPOS_REQUERIMIENTO).join(", ")}`,
    });
  }

  try {
    const resumen = await requerimientosServicio.obtenerResumenRequerimientos({ depositoId, tipo, q });
    return res.json(resumen);
  } catch (err) {
    console.error("Error al obtener el resumen de requerimientos:", err);
    return res.status(500).json({ error: "No se pudo obtener el resumen de requerimientos." });
  }
}

async function putRequerimiento(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const depositoId = Number(req.body?.depositoId);
  if (!Number.isInteger(depositoId)) {
    return res.status(400).json({ error: "depositoId es obligatorio" });
  }
  const { error, lineas } = validarDetalle(req.body?.detalle);
  if (error) return res.status(400).json({ error });

  try {
    const requerimiento = await requerimientosServicio.actualizarRequerimiento(id, { depositoId, detalle: lineas });
    return res.json(requerimiento);
  } catch (err) {
    return manejarError(res, err, "No se pudo actualizar el requerimiento.");
  }
}

async function postAnularRequerimiento(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
  if (!motivo) return res.status(400).json({ error: "El motivo de anulación es obligatorio." });

  try {
    const requerimiento = await requerimientosServicio.anularRequerimiento(id, motivo);
    return res.json(requerimiento);
  } catch (err) {
    return manejarError(res, err, "No se pudo anular el requerimiento.");
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

// Sprint 3 — punto 9: compra express. Mismo criterio que
// postSolicitarPresupuestos: la ruta cuelga de requerimientos (es la
// acción que dispara), la lógica vive en presupuestos.servicio.js.
async function postCompraExpress(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const { proveedorId, precios, plazoEntrega, costoFlete } = req.body ?? {};
  const proveedorIdNum = Number(proveedorId);
  if (!Number.isInteger(proveedorIdNum)) {
    return res.status(400).json({ error: "proveedorId es obligatorio" });
  }
  if (!Array.isArray(precios) || precios.length === 0) {
    return res.status(400).json({ error: "Cargá el precio unitario de cada artículo" });
  }
  const lineas = [];
  for (const linea of precios) {
    const articuloId = Number(linea?.articuloId);
    const precioUnitario = Number(linea?.precioUnitario);
    if (!Number.isInteger(articuloId)) {
      return res.status(400).json({ error: "Cada línea necesita un articuloId válido" });
    }
    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      return res.status(400).json({ error: "Cada precio unitario tiene que ser mayor a 0" });
    }
    lineas.push({ articuloId, precioUnitario });
  }

  try {
    const resultado = await presupuestosServicio.generarPresupuestoExpress(id, {
      proveedorId: proveedorIdNum,
      precios: lineas,
      plazoEntrega: typeof plazoEntrega === "string" ? plazoEntrega : null,
      costoFlete: costoFlete != null && costoFlete !== "" ? Number(costoFlete) : null,
    });
    return res.status(201).json(resultado);
  } catch (err) {
    return manejarError(res, err, "No se pudo generar la compra express.");
  }
}

// Sprint 3 — confirma una sugerencia de reposición automática del central
// (estado "Sugerida"). Para descartarla se reutiliza el endpoint de
// anular: mecánicamente es la misma baja lógica.
async function postConfirmarSugerencia(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const usuario = typeof req.body?.usuario === "string" ? req.body.usuario.trim() : null;

  try {
    const requerimiento = await requerimientosServicio.confirmarSugerencia(id, usuario);
    return res.json(requerimiento);
  } catch (err) {
    return manejarError(res, err, "No se pudo confirmar la sugerencia.");
  }
}

module.exports = {
  postRequerimiento,
  getRequerimientos,
  getResumen,
  getRequerimientoPorId,
  putRequerimiento,
  postAnularRequerimiento,
  postSolicitarPresupuestos,
  postCompraExpress,
  postConfirmarSugerencia,
};
