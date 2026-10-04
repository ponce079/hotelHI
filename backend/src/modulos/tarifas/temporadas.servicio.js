const { OPCIONES_TRANSACCION } = require('../../lib/constantes');
// Temporadas (HU-90) — Etapa 2 de tarifas por temporada.
// Lógica de negocio pura: no conoce HTTP y mantiene las escrituras
// relacionadas dentro de una misma transacción de Prisma, mismo criterio
// que reservas.servicio.js.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { hoyComoFechaUTC, parsearFechaSinHora: parsearFechaSinHoraBase } = require("../../lib/fechas");
const { NIVEL_TEMPORADA, NIVELES_TEMPORADA, PRIORIDAD_NIVEL, LIMITES_TARIFAS } = require("./tarifas.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Envoltorio fino: re-lanza el Error plano de lib/fechas.js como el
// ErrorDeNegocio propio de este módulo (mismo patrón que
// reservas.servicio.js con la misma función).
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

function normalizarNivel(valor) {
  const nivel = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  if (!NIVELES_TEMPORADA.includes(nivel)) {
    throw new ErrorDeNegocio(`nivel debe ser uno de: ${NIVELES_TEMPORADA.join(", ")}.`);
  }
  return nivel;
}

function normalizarEstadiaMinima(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    throw new ErrorDeNegocio("estadiaMinima debe ser un número entero mayor o igual a 1.");
  }
  return numero;
}

function formatearFechaMensaje(fecha) {
  return new Date(fecha).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

// --------------------------------------------------------------
// Solapamiento (regla 2, HU-90) — dentro del mismo nivel, ninguna
// temporada ACTIVA puede cruzarse con otra (rango de pernocte, ambos
// extremos inclusive: una que termina el 15 y otra que empieza el 15 SÍ
// se solapan — a propósito distinto del criterio semiabierto que usa
// disponibilidad de habitaciones en reservas.servicio.js, acá no hay
// "día de rotación", es directamente el mismo día de temporada).
// Solapar con un nivel DISTINTO está permitido (se resuelve por
// prioridad en resolverTemporadaEfectiva) — nunca se rechaza acá.
// --------------------------------------------------------------
async function exigirSinSolapamiento(tx, { nivel, fechaDesde, fechaHasta, excluirId }) {
  const conflictos = await tx.temporada.findMany({
    where: {
      nivel,
      activa: true,
      ...(excluirId ? { id: { not: excluirId } } : {}),
      fechaDesde: { lte: fechaHasta },
      fechaHasta: { gte: fechaDesde },
    },
  });
  if (conflictos.length > 0) {
    const detalle = conflictos
      .map((c) => `"${c.nombre}" (${formatearFechaMensaje(c.fechaDesde)} al ${formatearFechaMensaje(c.fechaHasta)})`)
      .join(", ");
    throw new ErrorDeNegocio(`Se solapa con otra temporada activa del mismo nivel: ${detalle}.`, 409);
  }
}

// --------------------------------------------------------------
// Alta
// --------------------------------------------------------------
async function crearTemporada(data, usuario) {
  const nivel = normalizarNivel(data?.nivel);
  const nombre = textoObligatorio(data?.nombre, "nombre", LIMITES_TARIFAS.nombreTemporada);
  const estadiaMinima = normalizarEstadiaMinima(data?.estadiaMinima);
  const cierreLlegada = data?.cierreLlegada === true;

  if (nivel === NIVEL_TEMPORADA.BASE) {
    const existente = await prisma.temporada.findFirst({ where: { nivel: NIVEL_TEMPORADA.BASE } });
    if (existente) throw new ErrorDeNegocio("Ya existe la temporada Base — no se puede crear una segunda.", 409);
    return prisma.temporada.create({
      data: { nombre, nivel, fechaDesde: null, fechaHasta: null, estadiaMinima, cierreLlegada, creadoPor: usuario || null },
    });
  }

  const fechaDesde = parsearFechaSinHora(data?.fechaDesde, "La fecha de inicio");
  const fechaHasta = parsearFechaSinHora(data?.fechaHasta, "La fecha de fin");
  if (fechaHasta.getTime() < fechaDesde.getTime()) {
    throw new ErrorDeNegocio("La fecha de fin no puede ser anterior a la de inicio.");
  }

  return prisma.$transaction(
    async (tx) => {
      // Re-chequeo protegido contra carreras — mismo criterio que
      // crearReservaEnTransaccion en reservas.servicio.js: FOR UPDATE
      // sobre las temporadas activas del mismo nivel antes de validar.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM temporadas WHERE nivel = ${nivel} AND activa = true FOR UPDATE`);
      await exigirSinSolapamiento(tx, { nivel, fechaDesde, fechaHasta, excluirId: null });
      return tx.temporada.create({
        data: { nombre, nivel, fechaDesde, fechaHasta, estadiaMinima, cierreLlegada, creadoPor: usuario || null },
      });
    },
    OPCIONES_TRANSACCION
  );
}

// --------------------------------------------------------------
// Edición (regla 4) — si fechaDesde ya pasó, no se puede tocar; si
// fechaHasta ya pasó, la temporada entera queda de solo lectura.
// estadiaMinima/cierreLlegada son editables en vigentes o futuras.
// --------------------------------------------------------------
async function actualizarTemporada(id, data, usuario) {
  const temporadaId = enteroPositivo(id, "id");
  const actual = await prisma.temporada.findUnique({ where: { id: temporadaId } });
  if (!actual) throw new ErrorDeNegocio("Temporada no encontrada.", 404);

  const hoy = hoyComoFechaUTC();
  if (actual.fechaHasta && actual.fechaHasta.getTime() < hoy.getTime()) {
    throw new ErrorDeNegocio("La temporada ya terminó: queda de solo lectura.");
  }

  const nombre = textoObligatorio(data?.nombre, "nombre", LIMITES_TARIFAS.nombreTemporada);
  const estadiaMinima = normalizarEstadiaMinima(data?.estadiaMinima);
  const cierreLlegada = data?.cierreLlegada === true;

  if (actual.nivel === NIVEL_TEMPORADA.BASE) {
    return prisma.temporada.update({ where: { id: temporadaId }, data: { nombre, estadiaMinima, cierreLlegada } });
  }

  const fechaDesde = parsearFechaSinHora(data?.fechaDesde, "La fecha de inicio");
  const fechaHasta = parsearFechaSinHora(data?.fechaHasta, "La fecha de fin");
  const desdeYaPaso = actual.fechaDesde.getTime() < hoy.getTime();
  if (desdeYaPaso && fechaDesde.getTime() !== actual.fechaDesde.getTime()) {
    throw new ErrorDeNegocio("La fecha de inicio ya pasó: no se puede modificar.");
  }
  if (fechaHasta.getTime() < fechaDesde.getTime()) {
    throw new ErrorDeNegocio("La fecha de fin no puede ser anterior a la de inicio.");
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM temporadas WHERE nivel = ${actual.nivel} AND activa = true FOR UPDATE`);
      await exigirSinSolapamiento(tx, { nivel: actual.nivel, fechaDesde, fechaHasta, excluirId: temporadaId });
      return tx.temporada.update({
        where: { id: temporadaId },
        data: { nombre, fechaDesde, fechaHasta, estadiaMinima, cierreLlegada },
      });
    },
    OPCIONES_TRANSACCION
  );
}

// --------------------------------------------------------------
// Baja lógica — exige motivo, la BASE no se puede dar de baja.
// Reactivar vuelve a validar solapamiento: pudo haberse creado otra
// temporada del mismo nivel mientras esta estaba inactiva (no contaba
// en el chequeo porque el filtro es `activa: true`).
// --------------------------------------------------------------
async function cambiarActivaTemporada(id, activa, motivoBaja, usuario) {
  const temporadaId = enteroPositivo(id, "id");
  if (typeof activa !== "boolean") throw new ErrorDeNegocio("activa debe ser booleano.");
  const actual = await prisma.temporada.findUnique({ where: { id: temporadaId } });
  if (!actual) throw new ErrorDeNegocio("Temporada no encontrada.", 404);

  if (!activa) {
    if (actual.nivel === NIVEL_TEMPORADA.BASE) {
      throw new ErrorDeNegocio("La temporada Base no se puede dar de baja.");
    }
    const motivo = textoObligatorio(motivoBaja, "El motivo de baja", LIMITES_TARIFAS.motivoBaja);
    return prisma.temporada.update({
      where: { id: temporadaId },
      data: { activa: false, motivoBaja: motivo, bajaPor: usuario || null },
    });
  }

  if (actual.nivel === NIVEL_TEMPORADA.BASE) {
    return prisma.temporada.update({ where: { id: temporadaId }, data: { activa: true } });
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM temporadas WHERE nivel = ${actual.nivel} AND activa = true FOR UPDATE`);
      await exigirSinSolapamiento(tx, {
        nivel: actual.nivel,
        fechaDesde: actual.fechaDesde,
        fechaHasta: actual.fechaHasta,
        excluirId: temporadaId,
      });
      return tx.temporada.update({ where: { id: temporadaId }, data: { activa: true } });
    },
    OPCIONES_TRANSACCION
  );
}

async function listarTemporadas({ activo } = {}) {
  const filtro = activo === "todos" ? {} : { activa: activo !== "false" };
  return prisma.temporada.findMany({ where: filtro, orderBy: [{ nivel: "asc" }, { fechaDesde: "asc" }] });
}

async function obtenerTemporadaPorId(id) {
  const temporadaId = enteroPositivo(id, "id");
  const temporada = await prisma.temporada.findUnique({ where: { id: temporadaId } });
  if (!temporada) throw new ErrorDeNegocio("Temporada no encontrada.", 404);
  return temporada;
}

// --------------------------------------------------------------
// resolverTemporadaEfectiva (regla 3) — la de mayor nivel que contenga
// la fecha, o BASE si ninguna otra matchea. Nunca devuelve null: si no
// hay una BASE activa configurada, es un error de configuración real.
// Pura y reutilizable — la Etapa 3 (motor de cotización) la consume tal
// cual, sin reimplementarla.
// --------------------------------------------------------------
async function resolverTemporadaEfectiva(fecha) {
  const candidatas = await prisma.temporada.findMany({
    where: {
      activa: true,
      OR: [{ nivel: NIVEL_TEMPORADA.BASE }, { fechaDesde: { lte: fecha }, fechaHasta: { gte: fecha } }],
    },
  });
  const base = candidatas.find((t) => t.nivel === NIVEL_TEMPORADA.BASE);
  if (!base) throw new ErrorDeNegocio("No hay temporada Base configurada.", 500);

  const especificas = candidatas.filter((t) => t.nivel !== NIVEL_TEMPORADA.BASE);
  if (especificas.length === 0) return base;
  especificas.sort((a, b) => PRIORIDAD_NIVEL[b.nivel] - PRIORIDAD_NIVEL[a.nivel]);
  return especificas[0];
}

// Variante por rango — UNA sola consulta (no N), usada por el calendario
// anual (HU-90) y reutilizable por la Etapa 3 (motor de cotización) para
// resolver varias noches de una estadía sin ida y vuelta a la base por
// cada día. `cliente` opcional (Etapa 4A) — un `tx` para que
// cotizarReserva pueda correr dentro de la misma transacción del alta o
// la modificación de una reserva.
async function resolverTemporadasEfectivasEnRango(fechaDesde, fechaHasta, cliente = prisma) {
  const candidatas = await cliente.temporada.findMany({
    where: {
      activa: true,
      OR: [{ nivel: NIVEL_TEMPORADA.BASE }, { fechaDesde: { lte: fechaHasta }, fechaHasta: { gte: fechaDesde } }],
    },
  });
  const base = candidatas.find((t) => t.nivel === NIVEL_TEMPORADA.BASE);
  if (!base) throw new ErrorDeNegocio("No hay temporada Base configurada.", 500);
  const especificas = candidatas.filter((t) => t.nivel !== NIVEL_TEMPORADA.BASE);

  const UN_DIA_MS = 24 * 60 * 60 * 1000;
  const resultado = [];
  for (let t = fechaDesde.getTime(); t <= fechaHasta.getTime(); t += UN_DIA_MS) {
    const fecha = new Date(t);
    const enRango = especificas.filter(
      (tmp) => tmp.fechaDesde.getTime() <= fecha.getTime() && tmp.fechaHasta.getTime() >= fecha.getTime()
    );
    let ganadora = base;
    if (enRango.length > 0) {
      enRango.sort((a, b) => PRIORIDAD_NIVEL[b.nivel] - PRIORIDAD_NIVEL[a.nivel]);
      ganadora = enRango[0];
    }
    resultado.push({
      fecha,
      temporadaId: ganadora.id,
      nombre: ganadora.nombre,
      nivel: ganadora.nivel,
      estadiaMinima: ganadora.estadiaMinima,
      cierreLlegada: ganadora.cierreLlegada,
    });
  }
  return resultado;
}

module.exports = {
  ErrorDeNegocio,
  crearTemporada,
  actualizarTemporada,
  cambiarActivaTemporada,
  listarTemporadas,
  obtenerTemporadaPorId,
  resolverTemporadaEfectiva,
  resolverTemporadasEfectivasEnRango,
};
