// src/modulos/proveedores/proveedores.controlador.js

const { RUBROS, CONDICIONES_COMERCIALES } = require("../../lib/constantes");
const { CUIT_REGEX, RAZON_SOCIAL_REGEX, RAZON_SOCIAL_MAX_LENGTH, normalizarCuit } = require("./proveedores.constantes");
const proveedoresServicio = require("./proveedores.servicio");

// Campo de contacto opcional: si no vino como texto (nunca deberia
// pasar desde la pantalla, pero no hay validacion de tipos en el
// backend todavia — ver Sprint 3), se trata como ausente en vez de
// llamar .trim() a ciegas y tirar un TypeError no capturado que deja
// el request colgado sin respuesta.
function textoOpcional(valor) {
  if (typeof valor !== "string") return null;
  return valor.trim() || null;
}

// Validación compartida entre alta y edición: los dos aceptan exactamente
// los mismos campos (HU-18/19). Devuelve { error } o { datos } ya limpios.
function validarPayload(body) {
  const razonSocial = typeof body?.razonSocial === "string" ? body.razonSocial.trim() : body?.razonSocial;
  const cuit = normalizarCuit(body?.cuit);
  const { condicionComercial, rubros } = body ?? {};

  if (!razonSocial) return { error: "razonSocial es obligatoria" };
  if (razonSocial.length > RAZON_SOCIAL_MAX_LENGTH) {
    return { error: `razonSocial no puede superar los ${RAZON_SOCIAL_MAX_LENGTH} caracteres` };
  }
  if (!RAZON_SOCIAL_REGEX.test(razonSocial)) {
    return { error: "razonSocial contiene caracteres no permitidos" };
  }
  if (!cuit) return { error: "cuit es obligatorio" };
  if (!CUIT_REGEX.test(cuit)) {
    return { error: "cuit inválido. Formato esperado: 00-00000000-0" };
  }
  if (!textoOpcional(body?.contacto)) return { error: "contacto es obligatorio" };
  if (!condicionComercial) return { error: "condicionComercial es obligatoria" };
  if (!CONDICIONES_COMERCIALES.includes(condicionComercial)) {
    return { error: `condicionComercial inválida. Valores permitidos: ${CONDICIONES_COMERCIALES.join(", ")}` };
  }
  if (!Array.isArray(rubros) || rubros.length === 0) {
    return { error: "Elegí al menos un rubro" };
  }
  const invalidos = rubros.filter((r) => !RUBROS.includes(r));
  if (invalidos.length > 0) {
    return { error: `rubro inválido: ${invalidos.join(", ")}. Valores permitidos: ${RUBROS.join(", ")}` };
  }

  return {
    datos: {
      razonSocial,
      cuit,
      condicionComercial,
      // contacto es obligatorio (validado arriba); email/telefono/direccion
      // son opcionales: "" (o cualquier valor que no sea texto) se guarda
      // como null para no ensuciar la base con cadenas vacías ni romper
      // con un tipo inesperado.
      contacto: textoOpcional(body?.contacto),
      email: textoOpcional(body?.email),
      telefono: textoOpcional(body?.telefono),
      direccion: textoOpcional(body?.direccion),
      rubros: [...new Set(rubros)],
    },
  };
}

// El @unique de `cuit` en el schema es la garantía real de unicidad — no
// se chequea "a mano" antes del insert, se deja que la base rechace y se
// traduce el P2002 a un 409 con mensaje claro (Guía Técnica, sección 0.5).
function manejarError(res, err, mensajeGenerico, cuit) {
  if (err instanceof proveedoresServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.code === "P2002") {
    return res.status(409).json({ error: `Ya existe un proveedor con el CUIT ${cuit}` });
  }
  console.error(mensajeGenerico, err);
  return res.status(500).json({ error: mensajeGenerico });
}

async function postProveedor(req, res) {
  const { error, datos } = validarPayload(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const proveedor = await proveedoresServicio.crearProveedor(datos);
    return res.status(201).json(proveedor);
  } catch (err) {
    return manejarError(res, err, "No se pudo crear el proveedor.", datos.cuit);
  }
}

async function getProveedores(req, res) {
  const { q, rubro, condicionComercial, estado } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

  try {
    // ?activos=1 es el atajo para los combos de otras pantallas (invitar a
    // cotizar, filtros): devuelve un array plano, sin paginar.
    if (req.query.activos === "1") {
      const items = await proveedoresServicio.listarProveedoresActivos({ rubro });
      return res.json(items);
    }
    const resultado = await proveedoresServicio.listarProveedores({ q, rubro, condicionComercial, estado, page, pageSize });
    return res.json(resultado);
  } catch (err) {
    console.error("Error al listar proveedores:", err);
    return res.status(500).json({ error: "No se pudieron listar los proveedores." });
  }
}

async function getProveedorPorId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const proveedor = await proveedoresServicio.obtenerProveedorPorId(id);
    if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado" });
    return res.json(proveedor);
  } catch (err) {
    console.error("Error al obtener proveedor:", err);
    return res.status(500).json({ error: "No se pudo obtener el proveedor." });
  }
}

async function putProveedor(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const { error, datos } = validarPayload(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const proveedor = await proveedoresServicio.actualizarProveedor(id, datos);
    return res.json(proveedor);
  } catch (err) {
    return manejarError(res, err, "No se pudo editar el proveedor.", datos.cuit);
  }
}

async function patchEstadoProveedor(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const { activo } = req.body ?? {};
  if (typeof activo !== "boolean") {
    return res.status(400).json({ error: "activo es obligatorio y debe ser booleano" });
  }

  try {
    const proveedor = await proveedoresServicio.cambiarEstadoProveedor(id, activo);
    return res.json(proveedor);
  } catch (err) {
    return manejarError(res, err, "No se pudo cambiar el estado del proveedor.");
  }
}

async function getOrdenesCompraDeProveedor(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const resultado = await proveedoresServicio.listarOrdenesCompraDeProveedor(id, { sort: req.query.sort });
    return res.json(resultado);
  } catch (err) {
    return manejarError(res, err, "No se pudo obtener el historial de órdenes de compra.");
  }
}

module.exports = {
  postProveedor,
  getProveedores,
  getProveedorPorId,
  putProveedor,
  patchEstadoProveedor,
  getOrdenesCompraDeProveedor,
};
