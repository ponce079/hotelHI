const { OPCIONES_TRANSACCION } = require('../../lib/constantes');
// Actualización masiva de tarifas (HU-93) — Etapa 2 de tarifas por
// temporada. Lógica de negocio pura: no conoce HTTP.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { hoyComoFechaUTC, parsearFechaSinHora: parsearFechaSinHoraBase } = require("../../lib/fechas");
const { crearConNumeroSecuencial } = require("../../lib/numeracion");
const { obtenerTarifaVigente } = require("./precios.servicio");
const { redondearAMultiploDe100 } = require("./redondeo");
const { LIMITES_TARIFAS, ESTADO_LOTE } = require("./tarifas.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

function parsearFechaSinHora(valor, campo) {
  try {
    return parsearFechaSinHoraBase(valor, campo);
  } catch (err) {
    throw new ErrorDeNegocio(err.message);
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

function normalizarListaIds(valor) {
  return Array.isArray(valor) ? valor.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0) : [];
}

function validarEntradaLote(data) {
  const porcentaje = Number(data?.porcentaje);
  if (!Number.isFinite(porcentaje) || porcentaje === 0) {
    throw new ErrorDeNegocio("porcentaje debe ser un número distinto de 0.");
  }
  const vigenteDesde = parsearFechaSinHora(data?.vigenteDesde, "vigenteDesde");
  const hoy = hoyComoFechaUTC();
  if (vigenteDesde.getTime() < hoy.getTime()) {
    throw new ErrorDeNegocio("vigenteDesde no puede ser anterior a hoy.");
  }
  return {
    porcentaje,
    vigenteDesde,
    temporadaIds: normalizarListaIds(data?.temporadaIds),
    tipoHabitacionIds: normalizarListaIds(data?.tipoHabitacionIds),
  };
}

// Alcance: tipos activos × temporadas activas, filtrados si vienen ids.
async function resolverAlcance({ temporadaIds, tipoHabitacionIds }, cliente) {
  const tipos = await cliente.tipoHabitacion.findMany({
    where: { activo: true, ...(tipoHabitacionIds.length ? { id: { in: tipoHabitacionIds } } : {}) },
  });
  const temporadas = await cliente.temporada.findMany({
    where: { activa: true, ...(temporadaIds.length ? { id: { in: temporadaIds } } : {}) },
  });
  const combinaciones = [];
  for (const tipo of tipos) {
    for (const temporada of temporadas) combinaciones.push({ tipo, temporada });
  }
  return combinaciones;
}

// Núcleo compartido entre vista previa y confirmación — recibe `cliente`
// (prisma o un tx) para poder recalcularse DENTRO de la transacción de
// confirmación sin drift respecto a lo que se vio en la vista previa.
//
// Ajuste 1 (base de cálculo): la tarifa vigente A LA FECHA `vigenteDesde`
// del lote (obtenerTarifaVigente con esa fecha, no "hoy") — así un lote
// que cae después de un aumento futuro ya cargado es acumulativo sobre
// ese aumento, no lo pisa recalculando desde el precio de hoy.
//
// Cada celda del alcance cae en una de tres categorías (ajuste A):
//   - conflicto: ya existe una Tarifa con vigenteDesde EXACTAMENTE igual
//     a la del lote para esa celda.
//   - omitida: no hay ninguna tarifa vigente a esa fecha — nada que
//     bonificar.
//   - normal: hay base y no hay conflicto — se calcula el precio nuevo.
async function calcularCeldas({ porcentaje, vigenteDesde, temporadaIds, tipoHabitacionIds }, cliente = prisma) {
  const combinaciones = await resolverAlcance({ temporadaIds, tipoHabitacionIds }, cliente);
  const normales = [];
  const conflictos = [];
  const omitidas = [];

  for (const { tipo, temporada } of combinaciones) {
    const conflictoExistente = await cliente.tarifa.findUnique({
      where: {
        tipoHabitacionId_temporadaId_vigenteDesde: {
          tipoHabitacionId: tipo.id,
          temporadaId: temporada.id,
          vigenteDesde,
        },
      },
    });
    if (conflictoExistente) {
      conflictos.push({ tipoHabitacionId: tipo.id, tipoNombre: tipo.nombre, temporadaId: temporada.id, temporadaNombre: temporada.nombre });
      continue;
    }

    const base = await obtenerTarifaVigente(tipo.id, temporada.id, vigenteDesde, cliente);
    if (!base) {
      omitidas.push({ tipoHabitacionId: tipo.id, tipoNombre: tipo.nombre, temporadaId: temporada.id, temporadaNombre: temporada.nombre });
      continue;
    }

    // .toNumber() enseguida: acá abajo sigue siendo aritmética con Number
    // (a propósito, ver el comentario del ajuste A en redondeo.js — no hace
    // falta reescribir esta cuenta a Decimal), y un Decimal crudo viajando
    // por `normales`/la vista previa/el doble de tests no aporta nada.
    const precioBaseNuevo = redondearAMultiploDe100(Number(base.precioBase) * (1 + porcentaje / 100)).toNumber();
    const adicionalNuevo = redondearAMultiploDe100(Number(base.adicionalAdultoExtra) * (1 + porcentaje / 100)).toNumber();
    normales.push({
      tipoHabitacionId: tipo.id,
      tipoNombre: tipo.nombre,
      temporadaId: temporada.id,
      temporadaNombre: temporada.nombre,
      precioBaseActual: Number(base.precioBase),
      precioBaseNuevo,
      adicionalActual: Number(base.adicionalAdultoExtra),
      adicionalNuevo,
    });
  }

  return { normales, conflictos, omitidas };
}

async function calcularVistaPrevia(data) {
  const entrada = validarEntradaLote(data);
  const { normales, conflictos, omitidas } = await calcularCeldas(entrada);
  return { ...entrada, normales, conflictos, omitidas };
}

// Confirmación (regla 9) — una única transacción: recalcula (evita drift
// con la vista previa), rechaza si queda algún conflicto, crea el lote
// con numeración correlativa y una Tarifa por cada celda "normal".
async function confirmarActualizacion(data, usuario) {
  const entrada = validarEntradaLote(data);
  const motivo = textoObligatorio(data?.motivo, "El motivo", LIMITES_TARIFAS.motivoLote);

  return prisma.$transaction(
    async (tx) => {
      const { normales, conflictos } = await calcularCeldas(entrada, tx);
      if (conflictos.length > 0) {
        const detalle = conflictos.map((c) => `${c.tipoNombre} / ${c.temporadaNombre}`).join(", ");
        throw new ErrorDeNegocio(
          `Ya existe una tarifa con esa fecha de vigencia en: ${detalle}. Elegí otra fecha o sacalas del alcance.`,
          409
        );
      }
      if (normales.length === 0) {
        throw new ErrorDeNegocio("No hay ninguna celda con tarifa vigente para actualizar en el alcance elegido.");
      }

      const lote = await crearConNumeroSecuencial(tx, "loteActualizacionTarifaria", {
        prefijo: "ACT",
        data: {
          porcentaje: entrada.porcentaje,
          vigenteDesde: entrada.vigenteDesde,
          filtrosAplicados: JSON.stringify({ temporadaIds: entrada.temporadaIds, tipoHabitacionIds: entrada.tipoHabitacionIds }),
          motivo,
          creadoPor: usuario || null,
        },
      });

      for (const celda of normales) {
        await tx.tarifa.create({
          data: {
            tipoHabitacionId: celda.tipoHabitacionId,
            temporadaId: celda.temporadaId,
            precioBase: celda.precioBaseNuevo,
            adicionalAdultoExtra: celda.adicionalNuevo,
            vigenteDesde: entrada.vigenteDesde,
            loteActualizacionId: lote.id,
            creadoPor: usuario || null,
          },
        });
      }

      return tx.loteActualizacionTarifaria.findUnique({ where: { id: lote.id }, include: { tarifas: true } });
    },
    OPCIONES_TRANSACCION
  );
}

// Anulación (regla 9 + ajuste B) — solo si todavía no llegó su vigencia,
// y solo si ninguna celda que tocó tiene una versión POSTERIOR (pudo
// haberse calculado sobre estos precios: anularlo la dejaría huérfana).
async function anularLote(id, motivoAnulacion, usuario) {
  const loteId = enteroPositivo(id, "id");
  const motivo = textoObligatorio(motivoAnulacion, "El motivo de anulación", LIMITES_TARIFAS.motivoAnulacionLote);

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM lotes_actualizacion_tarifaria WHERE id = ${loteId} FOR UPDATE`);
      const lote = await tx.loteActualizacionTarifaria.findUnique({ where: { id: loteId }, include: { tarifas: true } });
      if (!lote) throw new ErrorDeNegocio("Lote no encontrado.", 404);
      if (lote.estado !== ESTADO_LOTE.APLICADO) throw new ErrorDeNegocio(`El lote ya está "${lote.estado}".`);

      const hoy = hoyComoFechaUTC();
      if (lote.vigenteDesde.getTime() <= hoy.getTime()) {
        throw new ErrorDeNegocio("El lote ya está vigente: no se puede anular.", 409);
      }

      const bloqueantes = [];
      for (const t of lote.tarifas) {
        const posterior = await tx.tarifa.findFirst({
          where: { tipoHabitacionId: t.tipoHabitacionId, temporadaId: t.temporadaId, vigenteDesde: { gt: lote.vigenteDesde } },
        });
        if (posterior) {
          const [tipo, temporada] = await Promise.all([
            tx.tipoHabitacion.findUnique({ where: { id: t.tipoHabitacionId } }),
            tx.temporada.findUnique({ where: { id: t.temporadaId } }),
          ]);
          bloqueantes.push(`${tipo?.nombre ?? t.tipoHabitacionId} / ${temporada?.nombre ?? t.temporadaId}`);
        }
      }
      if (bloqueantes.length > 0) {
        throw new ErrorDeNegocio(
          `No se puede anular: hay versiones posteriores calculadas sobre estos precios en ${bloqueantes.join(", ")}.`,
          409
        );
      }

      await tx.tarifa.deleteMany({ where: { loteActualizacionId: loteId } });
      return tx.loteActualizacionTarifaria.update({
        where: { id: loteId },
        data: { estado: ESTADO_LOTE.ANULADO, motivoAnulacion: motivo, anuladoPor: usuario || null },
      });
    },
    OPCIONES_TRANSACCION
  );
}

async function listarLotes() {
  return prisma.loteActualizacionTarifaria.findMany({ orderBy: { id: "desc" }, include: { tarifas: true } });
}

module.exports = {
  ErrorDeNegocio,
  calcularVistaPrevia,
  confirmarActualizacion,
  anularLote,
  listarLotes,
  redondearAMultiploDe100,
};
