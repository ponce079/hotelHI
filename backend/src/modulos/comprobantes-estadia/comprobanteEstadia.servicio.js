const { OPCIONES_TRANSACCION } = require('../../lib/constantes');
const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { redondear } = require('../../lib/comprobantes');
const { crearConNumeroSecuencial } = require('../../lib/numeracion');
const { TIPOS_COMPROBANTE_ESTADIA } = require('./comprobanteEstadia.constantes');
const { armarDetalleCuenta } = require('./comprobanteDetalle');
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

// Valida el importe y la alícuota y separa neto / IVA / total. El importe
// se puede mandar de DOS formas (una sola de las dos):
//   - importeNeto: el IVA se suma encima (importeTotal = neto + IVA).
//   - importeTotal: precio final con IVA incluido; el neto y el IVA se
//     derivan hacia atrás y suman exactamente ese total (sin centavos de
//     diferencia). Es la que usan el check-out y las notas de crédito: la
//     cuenta del huésped es un precio final, no un neto.
const viene = (v) => v !== undefined && v !== null;

// Lazy: checkOut.servicio arrastra reservas/garantías; no se carga al
// arrancar este módulo (mismo criterio que garantiaEstadiaCheckOut).
function consolidarCuenta(reservaId) {
  return require('../check-out/checkOut.servicio').consolidarCargos(reservaId);
}

function resolverImportes({ importeNeto, importeTotal, alicuotaIVA }) {
  if (viene(importeNeto) === viene(importeTotal)) {
    throw new ErrorDeNegocio('Mandá importeNeto o importeTotal (uno solo de los dos).');
  }
  const campo = viene(importeNeto) ? 'importeNeto' : 'importeTotal';
  const base = viene(importeNeto) ? importeNeto : importeTotal;
  if (typeof base !== 'number' || !(base > 0)) {
    throw new ErrorDeNegocio(`${campo} debe ser un número mayor a 0.`);
  }
  if (typeof alicuotaIVA !== 'number' || alicuotaIVA < 0 || alicuotaIVA > 100) {
    throw new ErrorDeNegocio('alicuotaIVA debe ser un número entre 0 y 100.');
  }
  if (viene(importeNeto)) {
    const iva = redondear(importeNeto * (alicuotaIVA / 100));
    return { neto: importeNeto, iva, total: redondear(importeNeto + iva) };
  }
  const total = redondear(importeTotal);
  const neto = redondear(total / (1 + alicuotaIVA / 100));
  return { neto, iva: redondear(total - neto), total };
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
async function crearComprobante(data) {
  const { reservaId, alicuotaIVA, razonSocialTercero, cuitTercero } = data;

  if (!reservaId) throw new ErrorDeNegocio('reservaId es obligatorio.');
  // Observación 3: el total del comprobante lo fija el servidor desde la
  // cuenta consolidada (alojamiento + cargos adicionales + verificación), no
  // el frontend. Si el cliente manda un importeTotal, tiene que coincidir con
  // la cuenta: si no, la cuenta cambió desde que la vio y se rechaza.
  let datosImporte = data;
  if (!viene(data.importeNeto)) {
    const cuenta = await consolidarCuenta(reservaId);
    if (viene(data.importeTotal) && centavos(data.importeTotal) !== centavos(cuenta.totalAdeudado)) {
      throw new ErrorDeNegocio(
        'El total informado no coincide con la cuenta de la estadía (cambió desde que se mostró). Actualizá la pantalla y reintentá.',
        409
      );
    }
    datosImporte = { ...data, importeTotal: cuenta.totalAdeudado };
  }
  const importes = resolverImportes(datosImporte);
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
  const { neto: netoFinal, iva: importeIVA, total: importeTotal } = importes;

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
      OPCIONES_TRANSACCION
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
  const { motivo } = data;

  const { neto: importeNeto, iva: importeIVA, total: importeTotal } = resolverImportes(data);
  const alicuotaIVA = data.alicuotaIVA;
  if (!motivo || !motivo.trim()) throw new ErrorDeNegocio('El motivo es obligatorio.');
  if (motivo.trim().length > 191) throw new ErrorDeNegocio('El motivo no puede superar los 191 caracteres.');

  const original = await prisma.comprobanteEstadia.findUnique({ where: { id: Number(comprobanteId) } });
  if (!original) throw new ErrorDeNegocio('El comprobante original no existe.', 404);
  if (original.anulado) throw new ErrorDeNegocio('No se puede ajustar un comprobante anulado.');
  if (original.tipo !== 'Comprobante') {
    throw new ErrorDeNegocio('Solo se pueden crear notas de crédito sobre comprobantes de tipo "Comprobante".');
  }

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
          motivo: motivo.trim(),
        },
        include: { comprobanteRelacionado: true },
      }),
    OPCIONES_TRANSACCION
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
      reserva: { include: { huesped: true } },
      comprobanteRelacionado: true,
      // Notas de crédito que apuntan a este comprobante (si es el
      // original) — mismo nombre de relación auto-referenciada que
      // ComprobanteProveedor.ajustes en Sprint 2.
      ajustes: true,
    },
  });
  if (!comprobante) throw new ErrorDeNegocio('Comprobante no encontrado.', 404);
  const [detalle, pagos] = await Promise.all([detalleDelComprobante(comprobante), mediosDePagoDeLaReserva(comprobante.reservaId)]);
  return { ...comprobante, detalle, mediosDePago: pagos };
}

// Cómo se pagó la estadía, para el encabezado del comprobante: un renglón por medio de cada pago vigente (sin datos
// de tarjeta más que lo que ya guarda la referencia). Solo lectura.
async function mediosDePagoDeLaReserva(reservaId) {
  const pagos = await prisma.pagoEstadia.findMany({
    where: { reservaId: Number(reservaId), anulado: false },
    include: { medios: true },
    orderBy: { id: 'asc' },
  });
  return pagos.flatMap((p) =>
    p.medios.map((m) => ({ concepto: p.concepto, medioPago: m.medioPago, importe: Number(m.importe), referencia: m.referencia ?? null }))
  );
}

// Observación 3: líneas que componen el total (alojamiento, cargos
// adicionales, verificación). Solo para el Comprobante, no para las Notas de
// Crédito (que acreditan un importe, no re-detallan la cuenta). Se arma desde
// la cuenta de la reserva; si no se puede armar (reserva vieja sin precio
// congelado, etc.) devuelve null y la ficha sigue mostrando los importes.
async function detalleDelComprobante(comprobante) {
  if (comprobante.tipo !== 'Comprobante') return null;
  try {
    const detalle = armarDetalleCuenta(await consolidarCuenta(comprobante.reservaId));
    return detalle;
  } catch (err) {
    console.error('No se pudo armar el detalle del comprobante', comprobante.id, err.message);
    return null;
  }
}

async function listarPorReserva(reservaId) {
  return prisma.comprobanteEstadia.findMany({
    where: { reservaId: Number(reservaId) },
    orderBy: { id: 'desc' },
    include: { ajustes: true },
  });
}

// Listado general (pantalla de Comprobantes de Huésped). Todos los filtros
// son opcionales: reservaId, tipo, desde / hasta (YYYY-MM-DD, sobre la
// fecha de emisión, día completo en hora argentina) y q (texto libre sobre
// número, código de reserva, huésped o razón social del tercero).
async function listarComprobantes(filtros = {}) {
  const { reservaId, tipo, desde, hasta, q } = filtros;
  const where = {};

  if (reservaId) where.reservaId = Number(reservaId);
  if (tipo) {
    if (!TIPOS_COMPROBANTE_ESTADIA.includes(tipo)) {
      throw new ErrorDeNegocio(`tipo inválido. Valores permitidos: ${TIPOS_COMPROBANTE_ESTADIA.join(', ')}`);
    }
    where.tipo = tipo;
  }

  const rangoFecha = {};
  if (desde) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new ErrorDeNegocio('desde inválido (formato YYYY-MM-DD).');
    rangoFecha.gte = new Date(`${desde}T00:00:00.000-03:00`);
  }
  if (hasta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new ErrorDeNegocio('hasta inválido (formato YYYY-MM-DD).');
    rangoFecha.lte = new Date(`${hasta}T23:59:59.999-03:00`);
  }
  if (rangoFecha.gte || rangoFecha.lte) where.fecha = rangoFecha;

  const texto = (q || '').trim();
  if (texto) {
    where.OR = [
      { numero: { contains: texto } },
      { razonSocialTercero: { contains: texto } },
      { reserva: { codigoConfirmacion: { contains: texto } } },
      { reserva: { huesped: { nombre: { contains: texto } } } },
    ];
  }

  return prisma.comprobanteEstadia.findMany({
    where,
    orderBy: { id: 'desc' },
    include: {
      ajustes: true,
      reserva: { select: { id: true, codigoConfirmacion: true, huesped: { select: { id: true, nombre: true } } } },
    },
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
  listarComprobantes,
  anularComprobante,
  reporteCajaDiaria,
  ErrorDeNegocio,
};
