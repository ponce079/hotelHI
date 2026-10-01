// Tarifas versionadas por tipo de habitación y temporada (HU-92) — Etapa 2
// de tarifas por temporada. Lógica de negocio pura: no conoce HTTP.
//
// La tarifa se carga SOLO para el plan BASE (BAR) — los planes derivados
// (HU-91) calculan su precio como % de descuento sobre esto, no tienen
// fila propia acá. Con IVA incluido (precio final al consumidor): el
// desglose neto/IVA lo sigue haciendo ComprobanteEstadia, sin cambios.

const prisma = require("../../lib/prisma");
const { hoyComoFechaUTC, parsearFechaSinHora: parsearFechaSinHoraBase } = require("../../lib/fechas");

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

function enteroPositivo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor a 0.`);
  return numero;
}

function precioValido(valor, campo, { permitirCero = false } = {}) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || (permitirCero ? numero < 0 : numero <= 0)) {
    throw new ErrorDeNegocio(`${campo} debe ser un número ${permitirCero ? "mayor o igual a 0" : "mayor a 0"}.`);
  }
  return numero;
}

// --------------------------------------------------------------
// Alta — crea una versión nueva, nunca modifica una existente.
// --------------------------------------------------------------
async function crearTarifa(data, usuario) {
  const tipoHabitacionId = enteroPositivo(data?.tipoHabitacionId, "tipoHabitacionId");
  const temporadaId = enteroPositivo(data?.temporadaId, "temporadaId");
  const precioBase = precioValido(data?.precioBase, "precioBase");
  const adicionalAdultoExtra = precioValido(data?.adicionalAdultoExtra, "adicionalAdultoExtra", { permitirCero: true });
  const vigenteDesde = parsearFechaSinHora(data?.vigenteDesde, "vigenteDesde");

  const hoy = hoyComoFechaUTC();
  if (vigenteDesde.getTime() < hoy.getTime()) {
    throw new ErrorDeNegocio("vigenteDesde no puede ser anterior a hoy.");
  }

  const tipo = await prisma.tipoHabitacion.findUnique({ where: { id: tipoHabitacionId } });
  if (!tipo) throw new ErrorDeNegocio("El tipo de habitación indicado no existe.", 404);
  const temporada = await prisma.temporada.findUnique({ where: { id: temporadaId } });
  if (!temporada) throw new ErrorDeNegocio("La temporada indicada no existe.", 404);

  try {
    return await prisma.tarifa.create({
      data: { tipoHabitacionId, temporadaId, precioBase, adicionalAdultoExtra, vigenteDesde, creadoPor: usuario || null },
    });
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ErrorDeNegocio("Ya existe una versión de tarifa con esa fecha de vigencia para este tipo y temporada.", 409);
    }
    throw err;
  }
}

// Historial inmutable: una versión con vigenteDesde <= hoy ya tomó efecto
// (aunque después la haya superado una más nueva) — no se edita ni se
// borra. Una futura (vigenteDesde > hoy) todavía no vendió nada, sí, salvo
// que además caiga en alguno de estos dos casos (mismo criterio que el
// ajuste B de anularLote — integridad de la cadena de versiones):
//   a. Si vino de un lote de actualización masiva, esa versión es del
//      lote, no de esta celda sola: se deshace anulando el lote completo.
//   b. Si existe otra versión de la misma celda con vigenteDesde
//      posterior, esta pudo haberse usado como base de esa versión
//      posterior (ver el "acumulativo" de lotesActualizacion.servicio.js)
//      — editarla o borrarla la dejaría corriendo sobre datos fantasma.
async function exigirVersionEditable(tarifa) {
  const hoy = hoyComoFechaUTC();
  if (tarifa.vigenteDesde.getTime() <= hoy.getTime()) {
    throw new ErrorDeNegocio("Esta versión ya está vigente (o lo estuvo): es historial inmutable, no se puede editar ni borrar.", 409);
  }
  if (tarifa.loteActualizacionId) {
    const lote = await prisma.loteActualizacionTarifaria.findUnique({ where: { id: tarifa.loteActualizacionId } });
    throw new ErrorDeNegocio(
      `Esta versión pertenece al lote ${lote?.numero ?? tarifa.loteActualizacionId}: no se edita ni se borra individualmente, hay que anular el lote completo.`,
      409
    );
  }
  const posterior = await prisma.tarifa.findFirst({
    where: {
      tipoHabitacionId: tarifa.tipoHabitacionId,
      temporadaId: tarifa.temporadaId,
      vigenteDesde: { gt: tarifa.vigenteDesde },
    },
    orderBy: { vigenteDesde: "asc" },
  });
  if (posterior) {
    throw new ErrorDeNegocio(
      `No se puede editar ni borrar: existe una versión posterior vigente desde ${posterior.vigenteDesde.toISOString().slice(0, 10)} que pudo haberse calculado sobre esta.`,
      409
    );
  }
}

async function actualizarTarifa(id, data) {
  const tarifaId = enteroPositivo(id, "id");
  const actual = await prisma.tarifa.findUnique({ where: { id: tarifaId } });
  if (!actual) throw new ErrorDeNegocio("Tarifa no encontrada.", 404);
  await exigirVersionEditable(actual);

  const precioBase = precioValido(data?.precioBase, "precioBase");
  const adicionalAdultoExtra = precioValido(data?.adicionalAdultoExtra, "adicionalAdultoExtra", { permitirCero: true });
  const vigenteDesde = parsearFechaSinHora(data?.vigenteDesde, "vigenteDesde");
  const hoy = hoyComoFechaUTC();
  if (vigenteDesde.getTime() < hoy.getTime()) {
    throw new ErrorDeNegocio("vigenteDesde no puede ser anterior a hoy.");
  }

  try {
    return await prisma.tarifa.update({ where: { id: tarifaId }, data: { precioBase, adicionalAdultoExtra, vigenteDesde } });
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ErrorDeNegocio("Ya existe una versión de tarifa con esa fecha de vigencia para este tipo y temporada.", 409);
    }
    throw err;
  }
}

async function eliminarTarifa(id) {
  const tarifaId = enteroPositivo(id, "id");
  const actual = await prisma.tarifa.findUnique({ where: { id: tarifaId } });
  if (!actual) throw new ErrorDeNegocio("Tarifa no encontrada.", 404);
  await exigirVersionEditable(actual);
  await prisma.tarifa.delete({ where: { id: tarifaId } });
}

// --------------------------------------------------------------
// obtenerTarifaVigente (regla 6) — la versión con mayor vigenteDesde
// <= fechaVenta. Pura, sin validar argumentos a propósito: la Etapa 3
// (motor de cotización) la llama en caliente por cada noche de una
// estadía, no tiene sentido revalidar tipos acá.
// --------------------------------------------------------------
async function obtenerTarifaVigente(tipoHabitacionId, temporadaId, fechaVenta, cliente = prisma) {
  return cliente.tarifa.findFirst({
    where: { tipoHabitacionId, temporadaId, vigenteDesde: { lte: fechaVenta } },
    orderBy: { vigenteDesde: "desc" },
  });
}

// --------------------------------------------------------------
// obtenerTarifasVigentes (Etapa 3, HU-94) — misma resolución que
// obtenerTarifaVigente, pero para VARIAS temporadas de un mismo tipo en
// una sola consulta (ajuste C): el motor de cotización tiene que resolver
// la tarifa de cada noche de una estadía de hasta 30 noches, y la mayoría
// de esas noches comparten temporada — llamar obtenerTarifaVigente una vez
// por noche sería hasta 30 consultas para, en la práctica, un puñado de
// temporadas distintas. Mismo patrón de "una consulta + Map de primera
// aparición" que ya usa grillaTarifas.
// --------------------------------------------------------------
async function obtenerTarifasVigentes(tipoHabitacionId, temporadaIds, fechaVenta, cliente = prisma) {
  const idsUnicos = [...new Set(temporadaIds)];
  const filas = idsUnicos.length
    ? await cliente.tarifa.findMany({
        where: { tipoHabitacionId, temporadaId: { in: idsUnicos }, vigenteDesde: { lte: fechaVenta } },
        orderBy: { vigenteDesde: "desc" },
      })
    : [];
  const porTemporada = new Map();
  for (const t of filas) {
    if (!porTemporada.has(t.temporadaId)) porTemporada.set(t.temporadaId, t);
  }
  return porTemporada;
}

// --------------------------------------------------------------
// Grilla (HU-92) — tipos activos × temporadas activas, con la tarifa
// vigente HOY de cada celda (o null). Una sola consulta de Tarifa (no
// tipos×temporadas consultas sueltas) — mismo criterio de lote que
// consultarDisponibilidad en reservas.servicio.js.
// --------------------------------------------------------------
async function grillaTarifas() {
  const [tipos, temporadas] = await Promise.all([
    prisma.tipoHabitacion.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.temporada.findMany({ where: { activa: true }, orderBy: [{ nivel: "asc" }, { fechaDesde: "asc" }] }),
  ]);
  const hoy = hoyComoFechaUTC();
  const tipoIds = tipos.map((t) => t.id);
  const temporadaIds = temporadas.map((t) => t.id);

  const vigentesHoy =
    tipoIds.length && temporadaIds.length
      ? await prisma.tarifa.findMany({
          where: { tipoHabitacionId: { in: tipoIds }, temporadaId: { in: temporadaIds }, vigenteDesde: { lte: hoy } },
          orderBy: { vigenteDesde: "desc" },
        })
      : [];
  // La primera fila vista por (tipo,temporada) ya es la de mayor
  // vigenteDesde <= hoy, gracias al orderBy de arriba.
  const vigentePorCelda = new Map();
  for (const t of vigentesHoy) {
    const clave = `${t.tipoHabitacionId}-${t.temporadaId}`;
    if (!vigentePorCelda.has(clave)) vigentePorCelda.set(clave, t);
  }

  const celdas = [];
  for (const tipo of tipos) {
    for (const temporada of temporadas) {
      const vigente = vigentePorCelda.get(`${tipo.id}-${temporada.id}`) ?? null;
      celdas.push({
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        tarifaVigente: vigente,
        sinVigente: !vigente,
      });
    }
  }
  return { tipos, temporadas, celdas };
}

async function historialTarifa(tipoHabitacionId, temporadaId) {
  const tipoId = enteroPositivo(tipoHabitacionId, "tipoHabitacionId");
  const tempId = enteroPositivo(temporadaId, "temporadaId");
  return prisma.tarifa.findMany({ where: { tipoHabitacionId: tipoId, temporadaId: tempId }, orderBy: { vigenteDesde: "desc" } });
}

module.exports = {
  ErrorDeNegocio,
  crearTarifa,
  actualizarTarifa,
  eliminarTarifa,
  obtenerTarifaVigente,
  obtenerTarifasVigentes,
  grillaTarifas,
  historialTarifa,
};
