// Planes Tarifarios (HU-91) — Etapa 2 de tarifas por temporada.
// Lógica de negocio pura: no conoce HTTP.
//
// Estas condiciones (reembolsable, horas sin cargo, penalidad no-show) se
// GUARDAN pero todavía no se aplican en ningún lado: la regla fija de 24hs
// de cancelarReserva (HU-88, reservas.servicio.js) queda exactamente como
// está — no se toca acá ni se conecta con esto.

const prisma = require("../../lib/prisma");
const { TIPO_PLAN, TIPOS_PLAN, PENALIDADES_NO_SHOW, LIMITES_TARIFAS } = require("./tarifas.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

function textoObligatorio(valor, campo, maximo) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw new ErrorDeNegocio(`${campo} es obligatorio.`);
  if (texto.length > maximo) throw new ErrorDeNegocio(`${campo} no puede superar los ${maximo} caracteres.`);
  return texto;
}

function enteroPositivo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor a 0.`);
  return numero;
}

const PATRON_CODIGO = /^[A-Z0-9-]+$/;
function normalizarCodigo(valor) {
  const codigo = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  if (!codigo) throw new ErrorDeNegocio("codigo es obligatorio.");
  if (codigo.length > LIMITES_TARIFAS.codigoPlanMax) {
    throw new ErrorDeNegocio(`codigo no puede superar los ${LIMITES_TARIFAS.codigoPlanMax} caracteres.`);
  }
  if (!PATRON_CODIGO.test(codigo)) throw new ErrorDeNegocio("codigo solo puede tener letras, números y guion.");
  return codigo;
}

function normalizarPenalidad(valor) {
  const penalidad = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  if (!PENALIDADES_NO_SHOW.includes(penalidad)) {
    throw new ErrorDeNegocio(`penalidadNoShow debe ser uno de: ${PENALIDADES_NO_SHOW.join(", ")}.`);
  }
  return penalidad;
}

// Valida y arma el resto de los campos (todo lo que no es codigo/tipo,
// compartido por crear y actualizar). `esCreacion` habilita las
// validaciones específicas de DERIVADO que necesitan mirar el plan base.
async function normalizarCondiciones(data, tipo) {
  const nombre = textoObligatorio(data?.nombre, "nombre", LIMITES_TARIFAS.nombrePlan);
  const reembolsable = data?.reembolsable === true;

  let horasCancelacionSinCargo = null;
  if (reembolsable) {
    horasCancelacionSinCargo = enteroPositivo(data?.horasCancelacionSinCargo, "horasCancelacionSinCargo");
  }

  const penalidadNoShow = normalizarPenalidad(data?.penalidadNoShow);
  const visibleWeb = data?.visibleWeb !== false;

  let planBaseId = null;
  let descuentoPorcentaje = null;
  if (tipo === TIPO_PLAN.DERIVADO) {
    planBaseId = enteroPositivo(data?.planBaseId, "planBaseId");
    const base = await prisma.planTarifario.findUnique({ where: { id: planBaseId } });
    if (!base) throw new ErrorDeNegocio("El plan base indicado no existe.", 404);
    if (base.tipo !== TIPO_PLAN.BASE) {
      throw new ErrorDeNegocio("Un plan derivado solo puede derivar de un plan tipo BASE, no de otro derivado.");
    }
    descuentoPorcentaje = Number(data?.descuentoPorcentaje);
    if (!Number.isFinite(descuentoPorcentaje) || descuentoPorcentaje <= 0 || descuentoPorcentaje >= 100) {
      throw new ErrorDeNegocio("descuentoPorcentaje debe ser un número mayor a 0 y menor a 100.");
    }
  }

  return { nombre, reembolsable, horasCancelacionSinCargo, penalidadNoShow, visibleWeb, planBaseId, descuentoPorcentaje };
}

async function crearPlanTarifario(data, usuario) {
  const codigo = normalizarCodigo(data?.codigo);
  const tipo = typeof data?.tipo === "string" ? data.tipo.trim().toUpperCase() : "";
  if (!TIPOS_PLAN.includes(tipo)) throw new ErrorDeNegocio(`tipo debe ser uno de: ${TIPOS_PLAN.join(", ")}.`);

  if (tipo === TIPO_PLAN.BASE) {
    const existente = await prisma.planTarifario.findFirst({ where: { tipo: TIPO_PLAN.BASE } });
    if (existente) throw new ErrorDeNegocio("Ya existe un plan tipo BASE — no se puede crear un segundo.", 409);
  }

  const condiciones = await normalizarCondiciones(data, tipo);

  const codigoExistente = await prisma.planTarifario.findUnique({ where: { codigo } });
  if (codigoExistente) throw new ErrorDeNegocio(`Ya existe un plan tarifario con el código "${codigo}".`, 409);

  try {
    return await prisma.planTarifario.create({ data: { codigo, tipo, ...condiciones, creadoPor: usuario || null } });
  } catch (err) {
    if (err?.code === "P2002") throw new ErrorDeNegocio(`Ya existe un plan tarifario con el código "${codigo}".`, 409);
    throw err;
  }
}

// El código y el tipo NUNCA se tocan en una edición (regla 5: código
// inmutable; cambiar tipo BASE<->DERIVADO después de creado no está
// contemplado por el enunciado y complicaría la unicidad de BASE/las
// tarifas ya cargadas contra este plan).
async function actualizarPlanTarifario(id, data) {
  const planId = enteroPositivo(id, "id");
  const actual = await prisma.planTarifario.findUnique({ where: { id: planId } });
  if (!actual) throw new ErrorDeNegocio("Plan tarifario no encontrado.", 404);

  const condiciones = await normalizarCondiciones(data, actual.tipo);
  return prisma.planTarifario.update({ where: { id: planId }, data: condiciones });
}

// Baja lógica (regla 5): el plan BASE no se puede dar de baja — todos los
// derivados calculan su precio a partir de él.
async function cambiarActivoPlanTarifario(id, activo, motivoBaja, usuario) {
  const planId = enteroPositivo(id, "id");
  if (typeof activo !== "boolean") throw new ErrorDeNegocio("activo debe ser booleano.");
  const actual = await prisma.planTarifario.findUnique({ where: { id: planId } });
  if (!actual) throw new ErrorDeNegocio("Plan tarifario no encontrado.", 404);

  if (!activo) {
    if (actual.tipo === TIPO_PLAN.BASE) throw new ErrorDeNegocio("El plan BASE no se puede dar de baja.");
    const motivo = textoObligatorio(motivoBaja, "El motivo de baja", LIMITES_TARIFAS.motivoBaja);
    return prisma.planTarifario.update({
      where: { id: planId },
      data: { activo: false, motivoBaja: motivo, bajaPor: usuario || null },
    });
  }
  return prisma.planTarifario.update({ where: { id: planId }, data: { activo: true } });
}

// `cliente` opcional (Etapa 4A) — mismo motivo que en temporadas.servicio.js:
// dejar que cotizarReserva la llame dentro de la transacción del alta o la
// modificación de una reserva.
async function listarPlanesTarifarios({ activo } = {}, cliente = prisma) {
  const filtro = activo === "todos" ? {} : { activo: activo !== "false" };
  return cliente.planTarifario.findMany({ where: filtro, orderBy: [{ tipo: "asc" }, { nombre: "asc" }] });
}

async function obtenerPlanTarifarioPorId(id) {
  const planId = enteroPositivo(id, "id");
  const plan = await prisma.planTarifario.findUnique({ where: { id: planId } });
  if (!plan) throw new ErrorDeNegocio("Plan tarifario no encontrado.", 404);
  return plan;
}

module.exports = {
  ErrorDeNegocio,
  crearPlanTarifario,
  actualizarPlanTarifario,
  cambiarActivoPlanTarifario,
  listarPlanesTarifarios,
  obtenerPlanTarifarioPorId,
};
