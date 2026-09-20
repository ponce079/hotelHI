const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { redondear } = require('../../lib/comprobantes');
const { crearConNumeroSecuencial } = require('../../lib/numeracion');
const { TIPOS_COMPROBANTE_ESTADIA } = require('./comprobanteEstadia.constantes');
const { CUIT_REGEX, normalizarCuit } = require('../proveedores/proveedores.constantes');

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Comparar en centavos (enteros), mismo criterio que el resto del proyecto.
function centavos(n) {
  return Math.round(Number(n) * 100);
}

// --------------------------------------------------------------
// Alta de comprobante (HU-53, HU-55)
//
// Calca crearComprobante de comprobantes.servicio.js (Sprint 2), con 2
// diferencias a propósito (ver sección 5 de la guía): sin
// PATRON_NUMERO_COMPROBANTE (acá el número es correlativo interno, lo
// genera el sistema, no lo tipea nadie) y sin matching de 3 vías / OC
// (eso es exclusivo de Compras).
// --------------------------------------------------------------
//
// El importe se puede mandar de DOS formas (una sola de las dos):
//   - importeNeto: el IVA se suma encima (importeTotal = neto + IVA).
//   - importeTotal: precio final con IVA incluido; el neto y el IVA se
//     derivan hacia atrás y suman exactamente ese total (sin centavos de
//     diferencia). Es la que usa el check-out: la cuenta del huésped es un
//     precio final, no un neto.
async function crearComprobante(data) {
  const { reservaId, importeNeto, importeTotal: totalFinal, alicuotaIVA, razonSocialTercero, cuitTercero } = data;

  if (!reservaId) throw new ErrorDeNegocio('reservaId es obligatorio.');
  const viene = (v) => v !== undefined && v !== null;
  if (viene(importeNeto) === viene(totalFinal)) {
    throw new ErrorDeNegocio('Mandá importeNeto o importeTotal (uno solo de los dos).');
  }
  const importeBase = viene(importeNeto) ? importeNeto : totalFinal;
  if (typeof importeBase !== 'number' || !(importeBase > 0)) {
    throw new ErrorDeNegocio(`${viene(importeNeto) ? 'importeNeto' : 'importeTotal'} debe ser un número mayor a 0.`);
  }
  if (typeof alicuotaIVA !== 'number' || alicuotaIVA < 0 || alicuotaIVA > 100) {
    throw new ErrorDeNegocio('alicuotaIVA debe ser un número entre 0 y 100.');
  }
  // HU-55: si se carga uno de los dos datos del tercero, hace falta el otro
  // — un comprobante "a medias" a nombre de tercero no sirve para nada.
  const esATerceroRazon = (razonSocialTercero || '').trim();
  const esATerceroCuit = normalizarCuit((cuitTercero || '').trim());
  if ((esATerceroRazon && !esATerceroCuit) || (!esATerceroRazon && esATerceroCuit)) {
    throw new ErrorDeNegocio('Para facturar a nombre de un tercero hacen falta razón social y CUIT, los dos.');
  }
  if (esATerceroCuit && !CUIT_REGEX.test(esATerceroCuit)) {
    throw new ErrorDeNegocio('El CUIT del tercero debe tener el formato 00-00000000-0 (11 dígitos).');
  }

  // La tabla Reserva ya existe desde el día 1 (la creó Gimena junto con
  // las otras 10 tablas de Sprint 3) — se consulta directo, sin pasar por
  // el servicio de Integrante 2, que todavía puede no estar listo. Ver
  // sección 0 de la guía.
  const reserva = await prisma.reserva.findUnique({ where: { id: Number(reservaId) } });
  if (!reserva) throw new ErrorDeNegocio('La reserva no existe.', 404);
  // Se factura una estadía que está pasando o ya pasó, no una reserva que
  // todavía no arrancó ni una cancelada.
  if (!['En curso', 'Cerrada'].includes(reserva.estado)) {
    throw new ErrorDeNegocio(`No se puede emitir un comprobante de una reserva "${reserva.estado}".`, 409);
  }
  // Una estadía, un comprobante vigente: para corregirlo se anula o se
  // emite una nota de crédito (HU-56), no un segundo comprobante encima.
  const vigente = await prisma.comprobanteEstadia.findFirst({
    where: { reservaId: Number(reservaId), tipo: 'Comprobante', anulado: false },
  });
  if (vigente) {
    throw new ErrorDeNegocio(
      `La reserva ya tiene un comprobante vigente (${vigente.numero}). Anulalo o emití una nota de crédito.`,
      409
    );
  }

  // Cálculo de IVA — una sola vez acá al crear, nunca en el frontend ni
  // recalculado en cada lectura (mismo criterio que fechaVencimiento en
  // crearComprobante de Sprint 2).
  let netoFinal;
  let importeIVA;
  let importeTotal;
  if (viene(importeNeto)) {
    netoFinal = importeNeto;
    importeIVA = redondear(netoFinal * (alicuotaIVA / 100));
    importeTotal = redondear(netoFinal + importeIVA);
  } else {
    importeTotal = redondear(totalFinal);
    netoFinal = redondear(importeTotal / (1 + alicuotaIVA / 100));
    importeIVA = redondear(importeTotal - netoFinal);
  }

  let comprobante;
  try {
    comprobante = await prisma.$transaction(
      (tx) =>
        crearConNumeroSecuencial(tx, 'comprobanteEstadia', {
          prefijo: 'CE',
          data: {
            reservaId: Number(reservaId),
            tipo: 'Comprobante',
            importeNeto: netoFinal,
            alicuotaIVA,
            importeIVA,
            importeTotal,
            razonSocialTercero: esATerceroRazon || null,
            cuitTercero: esATerceroCuit || null,
          },
          include: { reserva: true },
        }),
      { timeout: 15000, maxWait: 10000 }
    );
  } catch (err) {
    // Red de seguridad ante una carrera contra el UNIQUE de `numero` —
    // no debería pasar nunca en la práctica (crearConNumeroSecuencial usa
    // un placeholder con UUID antes de asignar el número real), pero se
    // deja el mismo patrón que el resto del proyecto por las dudas.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ErrorDeNegocio('Ya existe un comprobante con ese número — reintentá.', 409);
    }
    throw err;
  }

  return comprobante;
}

// --------------------------------------------------------------
// Nota de Crédito (HU-56)
//
// Calca crearNota de comprobantes.servicio.js: mismo mecanismo de
// tipo + comprobanteRelacionadoId auto-referenciado. Sin el chequeo de
// verificarCierrePorPagos (es específico de Compras/OC, no aplica acá —
// ver sección 5 de la guía).
// --------------------------------------------------------------
async function crearNotaCredito(comprobanteId, data) {
  const { importeNeto, alicuotaIVA, motivo } = data;

  if (typeof importeNeto !== 'number' || importeNeto <= 0) {
    throw new ErrorDeNegocio('importeNeto debe ser un número mayor a 0.');
  }
  if (typeof alicuotaIVA !== 'number' || alicuotaIVA < 0 || alicuotaIVA > 100) {
    throw new ErrorDeNegocio('alicuotaIVA debe ser un número entre 0 y 100.');
  }
  if (!motivo || !motivo.trim()) throw new ErrorDeNegocio('El motivo es obligatorio.');

  const original = await prisma.comprobanteEstadia.findUnique({ where: { id: Number(comprobanteId) } });
  if (!original) throw new ErrorDeNegocio('El comprobante original no existe.', 404);
  if (original.anulado) throw new ErrorDeNegocio('No se puede ajustar un comprobante anulado.');
  if (original.tipo !== 'Comprobante') {
    throw new ErrorDeNegocio('Solo se pueden crear notas de crédito sobre comprobantes de tipo "Comprobante".');
  }

  const importeIVA = redondear(importeNeto * (alicuotaIVA / 100));
  const importeTotal = redondear(importeNeto + importeIVA);

  // Las notas de crédito (sumadas) no pueden acreditar más de lo que
  // facturó el comprobante original — si no, el reporte de caja (HU-54)
  // descontaría plata que nunca se cobró.
  const yaAcreditado = await prisma.comprobanteEstadia.aggregate({
    where: { comprobanteRelacionadoId: original.id, tipo: 'Nota de Crédito', anulado: false },
    _sum: { importeTotal: true },
  });
  const disponible = redondear(Number(original.importeTotal) - Number(yaAcreditado._sum.importeTotal || 0));
  if (centavos(importeTotal) > centavos(disponible)) {
    throw new ErrorDeNegocio(
      `La nota de crédito (${importeTotal}) supera lo que todavía se puede acreditar del comprobante (${disponible}).`
    );
  }

  const nota = await prisma.$transaction(
    (tx) =>
      crearConNumeroSecuencial(tx, 'comprobanteEstadia', {
        prefijo: 'CE',
        data: {
          reservaId: original.reservaId,
          tipo: 'Nota de Crédito',
          importeNeto,
          alicuotaIVA,
          importeIVA,
          importeTotal,
          comprobanteRelacionadoId: original.id,
        },
        include: { comprobanteRelacionado: true },
      }),
    { timeout: 15000, maxWait: 10000 }
  );

  return nota;
}

// --------------------------------------------------------------
// Ficha (con sus notas de crédito, si tiene)
// --------------------------------------------------------------
async function obtenerComprobante(id) {
  const comprobante = await prisma.comprobanteEstadia.findUnique({
    where: { id: Number(id) },
    include: {
      reserva: true,
      comprobanteRelacionado: true,
      // Notas de crédito que apuntan a este comprobante (si es el
      // original) — mismo nombre de relación auto-referenciada que
      // ComprobanteProveedor.ajustes en Sprint 2.
      ajustes: true,
    },
  });
  if (!comprobante) throw new ErrorDeNegocio('Comprobante no encontrado.', 404);
  return comprobante;
}

async function listarPorReserva(reservaId) {
  return prisma.comprobanteEstadia.findMany({
    where: { reservaId: Number(reservaId) },
    orderBy: { id: 'desc' },
    include: { ajustes: true },
  });
}

// --------------------------------------------------------------
// Anular (baja lógica) — HU-53
//
// Mismo criterio que anularComprobante de Sprint 2: bloquear si ya tiene
// notas de crédito aplicadas. A diferencia de ComprobanteProveedor, acá no
// hay "pagosAplicados" que bloqueen (PagoEstadia no referencia
// ComprobanteEstadia — son hermanos independientes bajo la misma Reserva,
// ver Modelo de Datos sección 2), así que ese chequeo no aplica.
// --------------------------------------------------------------
async function anularComprobante(id) {
  const comprobante = await prisma.comprobanteEstadia.findUnique({
    where: { id: Number(id) },
    include: { ajustes: { where: { anulado: false } } },
  });
  if (!comprobante) throw new ErrorDeNegocio('Comprobante no encontrado.', 404);
  if (comprobante.anulado) throw new ErrorDeNegocio('El comprobante ya está anulado.');
  if (comprobante.ajustes.length > 0) {
    throw new ErrorDeNegocio('No se puede anular un comprobante que tiene notas de crédito asociadas.');
  }

  return prisma.comprobanteEstadia.update({
    where: { id: Number(id) },
    data: { anulado: true },
    include: { reserva: true },
  });
}

// --------------------------------------------------------------
// Reporte de caja diaria (HU-54)
//
// Consulta agregada sobre PagoEstadiaMedio (totales por medio de pago) y
// ConsumoServicioAdicional (totales por tipo de servicio), ambas ya
// existentes desde el día 1 — se consultan con Prisma directo, sin pasar
// por el servicio de Integrante 3 (ver sección 0 de la guía).
//
// Las Notas de Crédito del día se descuentan del total general (HU-56:
// "se descuenta del reporte de ingresos").
// --------------------------------------------------------------
async function reporteCajaDiaria(fecha) {
  if (!fecha) throw new ErrorDeNegocio('La fecha es obligatoria (YYYY-MM-DD).');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorDeNegocio('Fecha inválida (formato YYYY-MM-DD).');
  // Argentina es UTC-3 fijo (mismo criterio que pagos.servicio.js y
  // cuentaCorriente.servicio.js). Sin el offset explícito, `new Date` usa la
  // zona del servidor: si corre en UTC, el "día" del reporte se corre 3 h y
  // los cobros de la noche caen en el día equivocado.
  const desde = new Date(`${fecha}T00:00:00.000-03:00`);
  const hasta = new Date(`${fecha}T23:59:59.999-03:00`);
  if (Number.isNaN(desde.getTime())) throw new ErrorDeNegocio('Fecha inválida.');

  const [medios, consumos, notasCredito] = await Promise.all([
    prisma.pagoEstadiaMedio.groupBy({
      by: ['medioPago'],
      where: { pagoEstadia: { anulado: false, fecha: { gte: desde, lte: hasta } } },
      _sum: { importe: true },
    }),
    // Requiere el modelo de Integrante 3 (ConsumoServicioAdicional) — si
    // todavía no tiene datos reales, esto simplemente da un array vacío,
    // no rompe el reporte.
    prisma.consumoServicioAdicional.groupBy({
      by: ['tipoServicio'],
      where: { fechaHora: { gte: desde, lte: hasta } },
      _sum: { monto: true },
    }),
    prisma.comprobanteEstadia.aggregate({
      where: { tipo: 'Nota de Crédito', anulado: false, fecha: { gte: desde, lte: hasta } },
      _sum: { importeTotal: true },
    }),
  ]);

  const totalPorMedio = medios.map((m) => ({ medioPago: m.medioPago, total: redondear(Number(m._sum.importe || 0)) }));
  const totalPorServicio = consumos.map((c) => ({
    tipoServicio: c.tipoServicio,
    total: redondear(Number(c._sum.monto || 0)),
  }));
  const totalCobrado = redondear(totalPorMedio.reduce((acc, m) => acc + m.total, 0));
  const totalNotasCredito = redondear(Number(notasCredito._sum.importeTotal || 0));

  return {
    fecha,
    totalPorMedio,
    totalPorServicio,
    totalCobrado,
    totalNotasCredito,
    totalNeto: redondear(totalCobrado - totalNotasCredito),
  };
}

module.exports = {
  crearComprobante,
  crearNotaCredito,
  obtenerComprobante,
  listarPorReserva,
  anularComprobante,
  reporteCajaDiaria,
  ErrorDeNegocio,
};
