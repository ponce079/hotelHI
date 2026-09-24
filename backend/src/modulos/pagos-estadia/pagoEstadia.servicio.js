const prisma = require('../../lib/prisma');
const {
  MEDIOS_PAGO_ESTADIA,
  MEDIOS_CON_TARJETA,
  CONCEPTOS_PAGO_ESTADIA,
  CONCEPTO_PAGO_FINAL,
} = require('./pagoEstadia.constantes');
const checkOutServicio = require('../check-out/checkOut.servicio');

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Comparar en centavos (enteros), mismo criterio que pagos.servicio.js
// (Sprint 2) — así 100.10 + 50.20 no falla un === por redondeo binario.
function centavos(n) {
  return Math.round(Number(n) * 100);
}

// --------------------------------------------------------------
// Cuánto se debe y cuánto ya se pagó, para una reserva.
//
// Delega en consolidarCargos (HU-48, módulo check-out): esa es la única
// fuente de verdad del total de la cuenta, así lo que muestra HU-49, lo que
// cobra HU-50 y lo que valida confirmarCheckOut es siempre el mismo número.
// La firma (reservaId, tx) -> { totalAdeudado, totalPagado, saldo } no
// cambió, así que crearPago y el controlador quedan iguales.
// --------------------------------------------------------------
async function calcularSaldoReserva(reservaId, tx = prisma) {
  try {
    const cuenta = await checkOutServicio.consolidarCargos(reservaId, tx);
    return {
      estadoReserva: cuenta.estadoReserva,
      totalAdeudado: cuenta.totalAdeudado,
      totalPagado: cuenta.totalPagado,
      saldo: cuenta.saldo,
    };
  } catch (err) {
    // El ErrorDeNegocio de check-out es otra clase: sin re-envolverlo, el
    // controlador de pagos lo trataría como error inesperado (500).
    if (err instanceof checkOutServicio.ErrorDeNegocio) throw new ErrorDeNegocio(err.message, err.statusCode);
    throw err;
  }
}

// Solo se cobra sobre reservas vivas: "En curso" (el caso normal, al
// check-out) o "Confirmada" (por si Check-in usa el pago como garantía,
// HU-46). Una reserva Cancelada o Cerrada no tiene nada que cobrar.
const ESTADOS_COBRABLES = ['En curso', 'Confirmada'];
function validarReservaCobrable(estado) {
  if (!ESTADOS_COBRABLES.includes(estado)) {
    throw new ErrorDeNegocio(`No se pueden registrar pagos sobre una reserva "${estado}".`, 409);
  }
}

// --------------------------------------------------------------
// Registrar un pago (HU-50) — medios combinables, sin cheque.
// --------------------------------------------------------------
// Referencia opcional del cobro (por ejemplo, el resultado de la tarjeta
// simulada: marca, últimos 4 dígitos, código de autorización y cuotas). Es
// solo un texto para auditar el pago: NUNCA se guarda el número completo de
// la tarjeta ni el código de seguridad.
const REFERENCIA_MAX_LENGTH = 191;
function referenciaDe(medio) {
  return typeof medio.referencia === 'string' ? medio.referencia.trim() : '';
}

// `concepto` (default "Pago final", HU-50 de siempre) distingue de dónde
// salió el cobro para la pantalla de Movimientos de Pago (HU-88) — quien
// llama desde la seña de reserva o la garantía en efectivo del check-in
// manda el suyo explícito (ver ReservaWizard.jsx / checkIn.servicio.js).
async function crearPago({ reservaId, medios, concepto = CONCEPTO_PAGO_FINAL }) {
  if (!reservaId) throw new ErrorDeNegocio('reservaId es obligatorio.');
  if (!Array.isArray(medios) || medios.length === 0) {
    throw new ErrorDeNegocio("Debe incluir al menos un medio de pago en 'medios'.");
  }
  if (!CONCEPTOS_PAGO_ESTADIA.includes(concepto)) {
    throw new ErrorDeNegocio(`concepto inválido. Valores permitidos: ${CONCEPTOS_PAGO_ESTADIA.join(', ')}`);
  }

  let totalMedios = 0;
  for (const m of medios) {
    if (!MEDIOS_PAGO_ESTADIA.includes(m.tipo)) {
      throw new ErrorDeNegocio(`medioPago inválido. Valores permitidos: ${MEDIOS_PAGO_ESTADIA.join(', ')}`);
    }
    const importe = Number(m.importe);
    if (!(importe > 0)) {
      throw new ErrorDeNegocio('Cada medio de pago necesita un importe mayor a cero.');
    }
    if (MEDIOS_CON_TARJETA.includes(m.tipo) && !referenciaDe(m)) {
      throw new ErrorDeNegocio(`El pago con ${m.tipo} necesita la autorización de la tarjeta (referencia).`);
    }
    if (referenciaDe(m).length > REFERENCIA_MAX_LENGTH) {
      throw new ErrorDeNegocio(`La referencia del pago no puede superar los ${REFERENCIA_MAX_LENGTH} caracteres.`);
    }
    totalMedios += importe;
  }

  // Chequeo rápido ("fail fast") fuera de la transacción — no bloquea
  // filas todavía. El definitivo pasa de nuevo, con lock, adentro.
  const { saldo: saldoPrevio, estadoReserva } = await calcularSaldoReserva(reservaId);
  validarReservaCobrable(estadoReserva);
  if (centavos(totalMedios) > centavos(saldoPrevio)) {
    throw new ErrorDeNegocio(
      `El total a pagar (${totalMedios}) supera el saldo pendiente de la reserva (${saldoPrevio}).`
    );
  }

  return prisma.$transaction(
    async (tx) => {
      // Bloquea la reserva mientras se recalcula el saldo fresco, para
      // que dos pagos concurrentes a la misma reserva no se pisen —
      // mismo criterio que crearOrdenPago en pagos.servicio.js.
      await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${Number(reservaId)} FOR UPDATE`;
      const { saldo: saldoFresco, estadoReserva: estadoFresco } = await calcularSaldoReserva(reservaId, tx);
      validarReservaCobrable(estadoFresco);
      if (centavos(totalMedios) > centavos(saldoFresco)) {
        throw new ErrorDeNegocio(
          `El total a pagar (${totalMedios}) supera el saldo pendiente actual de la reserva (${saldoFresco}). ` +
            'Puede haber cambiado por otro pago registrado al mismo tiempo — revisá e intentá de nuevo.'
        );
      }

      const estado = centavos(totalMedios) >= centavos(saldoFresco) ? 'Pagado' : 'Parcial';

      return tx.pagoEstadia.create({
        data: {
          reservaId: Number(reservaId),
          estado,
          concepto,
          medios: {
            create: medios.map((m) => ({
              medioPago: m.tipo,
              importe: Number(m.importe),
              ...(referenciaDe(m) ? { referencia: referenciaDe(m) } : {}),
            })),
          },
        },
        include: { medios: true, reserva: true },
      });
    },
    { timeout: 15000, maxWait: 10000 }
  );
}

async function obtenerPago(id) {
  const pago = await prisma.pagoEstadia.findUnique({
    where: { id: Number(id) },
    include: { medios: true, reserva: true },
  });
  if (!pago) throw new ErrorDeNegocio('Pago no encontrado.', 404);
  return pago;
}

async function listarPorReserva(reservaId) {
  const [pagos, saldo] = await Promise.all([
    prisma.pagoEstadia.findMany({
      where: { reservaId: Number(reservaId) },
      orderBy: { fecha: 'desc' },
      include: { medios: true },
    }),
    calcularSaldoReserva(reservaId),
  ]);
  return { pagos, totalAdeudado: saldo.totalAdeudado, totalPagado: saldo.totalPagado, saldo: saldo.saldo };
}

// --------------------------------------------------------------
// Movimientos de Pago (HU-88) — listado GLOBAL de todos los PagoEstadia de
// todas las reservas, no de una sola (eso ya lo cubre listarPorReserva).
// Mismo criterio de filtros que comprobanteEstadia.servicio.js/
// listarComprobantes: q busca por código de reserva o nombre del huésped,
// concepto/desde/hasta acotan.
// --------------------------------------------------------------
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function listarMovimientos(filtros = {}) {
  const { q, concepto, desde, hasta } = filtros;
  const where = {};

  if (concepto) {
    if (!CONCEPTOS_PAGO_ESTADIA.includes(concepto)) {
      throw new ErrorDeNegocio(`concepto inválido. Valores permitidos: ${CONCEPTOS_PAGO_ESTADIA.join(', ')}`);
    }
    where.concepto = concepto;
  }

  const rangoFecha = {};
  if (desde) {
    if (!PATRON_FECHA.test(desde)) throw new ErrorDeNegocio('desde inválido (formato YYYY-MM-DD).');
    rangoFecha.gte = new Date(`${desde}T00:00:00.000-03:00`);
  }
  if (hasta) {
    if (!PATRON_FECHA.test(hasta)) throw new ErrorDeNegocio('hasta inválido (formato YYYY-MM-DD).');
    rangoFecha.lte = new Date(`${hasta}T23:59:59.999-03:00`);
  }
  if (rangoFecha.gte || rangoFecha.lte) where.fecha = rangoFecha;

  const texto = (q || '').trim();
  if (texto) {
    where.OR = [
      { reserva: { codigoConfirmacion: { contains: texto } } },
      { reserva: { huesped: { nombre: { contains: texto } } } },
    ];
  }

  return prisma.pagoEstadia.findMany({
    where,
    orderBy: { fecha: 'desc' },
    include: {
      medios: true,
      reserva: { select: { id: true, codigoConfirmacion: true, huesped: { select: { id: true, nombre: true } } } },
    },
  });
}

// --------------------------------------------------------------
// Anular (HU-50 — sección de reversión implícita, mismo criterio que
// anularOrdenPago de Sprint 2: baja lógica, nunca se borra el registro).
// --------------------------------------------------------------
// `cliente` (default `prisma`) permite pasar el `tx` de una transacción ya
// abierta por quien llama — lo usa cancelarReserva (reservas.servicio.js,
// HU-37) para que cancelar la reserva y anular la seña sean una sola
// operación atómica, mismo criterio que cambiarEstadoHabitacion en
// habitaciones.servicio.js.
async function anularPago(id, motivo, cliente = prisma) {
  if (!motivo || !motivo.trim()) {
    throw new ErrorDeNegocio('El motivo de anulación es obligatorio.');
  }
  const pago = await cliente.pagoEstadia.findUnique({ where: { id: Number(id) }, include: { reserva: true } });
  if (!pago) throw new ErrorDeNegocio('Pago no encontrado.', 404);
  if (pago.anulado) throw new ErrorDeNegocio('El pago ya está anulado.');
  // El check-out solo se confirma con la cuenta saldada: anular un pago
  // después dejaría una reserva "Cerrada" con deuda.
  if (pago.reserva.estado === 'Cerrada') {
    throw new ErrorDeNegocio('No se puede anular un pago de una reserva ya cerrada (check-out confirmado).', 409);
  }

  return cliente.pagoEstadia.update({
    where: { id: Number(id) },
    data: { anulado: true, motivoAnulacion: motivo.trim() },
    include: { medios: true, reserva: true },
  });
}

module.exports = {
  calcularSaldoReserva,
  crearPago,
  obtenerPago,
  listarPorReserva,
  listarMovimientos,
  anularPago,
  ErrorDeNegocio,
};
