// Modificador por día de semana (regla 8, HU-92) — Etapa 2 de tarifas por
// temporada. Global para todo el hotel (7 filas fijas, no por tipo de
// habitación), sembrado por seed-tarifas.js. Se guarda y se muestra acá;
// se APLICA recién en la Etapa 3 (motor de cotización).

const prisma = require("../../lib/prisma");
const { RANGO_MODIFICADOR_DIA } = require("./tarifas.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

async function listarModificadores() {
  return prisma.modificadorDiaSemana.findMany({ orderBy: { diaSemana: "asc" } });
}

async function actualizarModificador(diaSemana, porcentaje) {
  const dia = Number(diaSemana);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
    throw new ErrorDeNegocio("diaSemana debe ser un número entero entre 0 (domingo) y 6 (sábado).");
  }
  const pct = Number(porcentaje);
  if (!Number.isFinite(pct) || pct < RANGO_MODIFICADOR_DIA.min || pct > RANGO_MODIFICADOR_DIA.max) {
    throw new ErrorDeNegocio(`porcentaje debe estar entre ${RANGO_MODIFICADOR_DIA.min} y ${RANGO_MODIFICADOR_DIA.max}.`);
  }

  const existente = await prisma.modificadorDiaSemana.findUnique({ where: { diaSemana: dia } });
  if (!existente) throw new ErrorDeNegocio("No existe un modificador para ese día de semana — corré el seed.", 404);

  return prisma.modificadorDiaSemana.update({ where: { diaSemana: dia }, data: { porcentaje: pct } });
}

module.exports = { ErrorDeNegocio, listarModificadores, actualizarModificador };
