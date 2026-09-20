const prisma = require('../../lib/prisma');
const { redondear } = require('../../lib/comprobantes');
const reservasServicio = require('../reservas/reservas.servicio');
const {
  TIPOS_CARGO_VERIFICACION,
  ESTADO_HABITACION_POST_CHECKOUT,
  TIPO_NOTIFICACION_HOUSEKEEPING,
  AREA_HOUSEKEEPING,
  CANAL_INTERNO,
  LIMITES_VERIFICACION,
} = require('./checkOut.constantes');

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Comparar en centavos (enteros), mismo criterio que pagos.servicio.js
// (Sprint 2) y pagoEstadia.servicio.js.
function centavos(n) {
  return Math.round(Number(n) * 100);
}

function idValido(valor, campo = 'reservaId') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorDeNegocio(`${campo} debe ser un entero positivo.`);
  return n;
}

const MS_POR_DIA = 1000 * 60 * 60 * 24;
function calcularNoches(fechaDesde, fechaHasta) {
  return Math.max(1, Math.round((new Date(fechaHasta) - new Date(fechaDesde)) / MS_POR_DIA));
}

// Las transiciones de estado de Reserva viven en reservas.servicio.js y
// tiran SU propio ErrorDeNegocio, que el controlador de check-out no
// reconocería (caería en 500). Se re-envuelve acá para conservar mensaje y
// código HTTP.
function envolverErrorReservas(err) {
  if (err instanceof reservasServicio.ErrorDeNegocio) {
    return new ErrorDeNegocio(err.message, err.statusCode);
  }
  return err;
}

// --------------------------------------------------------------
// HU-48 — Consolidación de cargos.
//
// "CargoEstadia" NO es una tabla: es este objeto agregado, armado en
// cada llamada con 3 fuentes:
//   (a) noches × tarifaPorNoche de cada habitación de la reserva
//   (b) ConsumoServicioAdicional (Integrante 3)
//   (c) CargoVerificacionCheckout (HU-87, propia)
// más lo ya pagado (PagoEstadiaMedio de pagos no anulados) para dar el
// saldo. Es la ÚNICA fuente de verdad del total de la cuenta: HU-49 lo
// muestra, HU-50 lo cobra (pagoEstadia.calcularSaldoReserva delega acá) y
// confirmarCheckOut lo re-valida dentro de la transacción.
//
// `cliente` permite pasar un `tx` para leer dentro de una transacción.
// Se consulta en serie (no Promise.all) a propósito: sobre una conexión
// de transacción las consultas se serializan igual.
// --------------------------------------------------------------
async function consolidarCargos(reservaId, cliente = prisma) {
  const id = idValido(reservaId);

  const reserva = await cliente.reserva.findUnique({
    where: { id },
    include: {
      huesped: true,
      reservaHabitaciones: { include: { habitacion: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!reserva) throw new ErrorDeNegocio('La reserva no existe.', 404);

  const noches = calcularNoches(reserva.fechaDesde, reserva.fechaHasta);

  const habitaciones = reserva.reservaHabitaciones.map((rh) => {
    const tarifaPorNoche = Number(rh.habitacion.tarifaPorNoche);
    return {
      habitacionId: rh.habitacion.id,
      numero: rh.habitacion.numero,
      tipo: rh.habitacion.tipo,
      tarifaPorNoche,
      noches,
      subtotal: redondear(tarifaPorNoche * noches),
    };
  });

  const consumosDb = await cliente.consumoServicioAdicional.findMany({
    where: { reservaId: id },
    orderBy: { fechaHora: 'asc' },
  });
  const consumos = consumosDb.map((c) => ({
    id: c.id,
    habitacionId: c.habitacionId,
    tipoServicio: c.tipoServicio,
    articuloId: c.articuloId ?? null,
    cantidad: c.cantidad == null ? null : Number(c.cantidad),
    monto: Number(c.monto),
    fechaHora: c.fechaHora,
  }));

  const verificacionesDb = await cliente.cargoVerificacionCheckout.findMany({
    where: { reservaId: id },
    orderBy: { fechaHora: 'asc' },
  });
  const verificaciones = verificacionesDb.map((v) => ({
    id: v.id,
    tipo: v.tipo,
    descripcion: v.descripcion,
    monto: Number(v.monto),
    registradoPor: v.registradoPor,
    fechaHora: v.fechaHora,
  }));

  const pagado = await cliente.pagoEstadiaMedio.aggregate({
    where: { pagoEstadia: { reservaId: id, anulado: false } },
    _sum: { importe: true },
  });

  const alojamiento = redondear(habitaciones.reduce((acc, h) => acc + h.subtotal, 0));
  const serviciosAdicionales = redondear(consumos.reduce((acc, c) => acc + c.monto, 0));
  const verificacion = redondear(verificaciones.reduce((acc, v) => acc + v.monto, 0));

  const totalAdeudado = redondear(alojamiento + serviciosAdicionales + verificacion);
  const totalPagado = redondear(Number(pagado._sum.importe || 0));
  const saldo = Math.max(0, redondear(totalAdeudado - totalPagado));

  return {
    reservaId: reserva.id,
    codigoConfirmacion: reserva.codigoConfirmacion,
    estadoReserva: reserva.estado,
    fechaDesde: reserva.fechaDesde,
    fechaHasta: reserva.fechaHasta,
    noches,
    huesped: reserva.huesped
      ? {
          id: reserva.huesped.id,
          nombre: reserva.huesped.nombre,
          tipoDocumento: reserva.huesped.tipoDocumento,
          numeroDocumento: reserva.huesped.numeroDocumento,
        }
      : null,
    habitaciones,
    consumos,
    verificaciones,
    subtotales: { alojamiento, serviciosAdicionales, verificacion },
    totalAdeudado,
    totalPagado,
    saldo,
  };
}

// --------------------------------------------------------------
// HU-87 — Verificación de la habitación (daño / faltante / minibar no
// registrado). Va DESPUÉS de consolidarCargos (HU-48) y ANTES de que el
// huésped valide la cuenta (HU-49): el cargo queda sumado en la próxima
// consolidación. Quién verificó queda en `registradoPor`.
//
// Se hace en transacción con lock sobre la reserva para que no se cuele
// un cargo justo mientras otra request está confirmando el check-out.
// --------------------------------------------------------------
async function registrarVerificacion(reservaId, data = {}) {
  const id = idValido(reservaId);
  const { tipo, descripcion, monto, registradoPor } = data;

  if (!TIPOS_CARGO_VERIFICACION.includes(tipo)) {
    throw new ErrorDeNegocio(`tipo inválido. Valores permitidos: ${TIPOS_CARGO_VERIFICACION.join(', ')}`);
  }
  const desc = String(descripcion ?? '').trim();
  if (!desc) throw new ErrorDeNegocio('La descripción es obligatoria: hay que dejar qué se encontró.');
  if (desc.length > LIMITES_VERIFICACION.descripcion) {
    throw new ErrorDeNegocio(`La descripción no puede superar ${LIMITES_VERIFICACION.descripcion} caracteres.`);
  }
  const importe = Number(monto);
  if (!Number.isFinite(importe) || importe <= 0) throw new ErrorDeNegocio('monto debe ser un número mayor a 0.');
  const quien = String(registradoPor ?? '').trim();
  if (!quien) throw new ErrorDeNegocio('registradoPor es obligatorio: hay que dejar quién realizó la verificación.');
  if (quien.length > LIMITES_VERIFICACION.registradoPor) {
    throw new ErrorDeNegocio(`registradoPor no puede superar ${LIMITES_VERIFICACION.registradoPor} caracteres.`);
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${id} FOR UPDATE`;
      const reserva = await tx.reserva.findUnique({ where: { id } });
      if (!reserva) throw new ErrorDeNegocio('La reserva no existe.', 404);
      if (reserva.estado !== 'En curso') {
        throw new ErrorDeNegocio(
          `Solo se puede verificar la habitación de una reserva "En curso" (esta está "${reserva.estado}").`
        );
      }

      const cargo = await tx.cargoVerificacionCheckout.create({
        data: { reservaId: id, tipo, descripcion: desc, monto: redondear(importe), registradoPor: quien },
      });
      const cuenta = await consolidarCargos(id, tx);
      return { cargo, cuenta };
    },
    { timeout: 15000, maxWait: 10000 }
  );
}

async function listarVerificaciones(reservaId) {
  const id = idValido(reservaId);
  const reserva = await prisma.reserva.findUnique({ where: { id }, select: { id: true } });
  if (!reserva) throw new ErrorDeNegocio('La reserva no existe.', 404);
  return prisma.cargoVerificacionCheckout.findMany({ where: { reservaId: id }, orderBy: { fechaHora: 'asc' } });
}

// --------------------------------------------------------------
// HU-49 + HU-51 + HU-52 — Confirmar el check-out.
//
// Una sola transacción atómica:
//   1. lock de la reserva y re-consolidación fresca de la cuenta
//   2. la cuenta tiene que estar saldada (saldo = 0)
//   3. Reserva.estado -> 'Cerrada'            (reservasServicio.marcarCerrada)
//   4. Habitacion.estado -> 'en limpieza'      (HU-51, misma transacción)
//   5. una Notificacion 'Housekeeping' por habitación (HU-52; es el
//      registro del envío)
// Si cualquier paso falla, no queda nada a medias.
//
// HU-49: la confirmación explícita del huésped llega como
// `cargosValidados: true`; sin eso no se cierra.
// --------------------------------------------------------------
async function confirmarCheckOut(reservaId, { cargosValidados } = {}) {
  const id = idValido(reservaId);
  if (cargosValidados !== true) {
    throw new ErrorDeNegocio(
      'Falta la confirmación de cargos con el huésped (cargosValidados: true) antes de cerrar la cuenta.'
    );
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${id} FOR UPDATE`;
      const cuenta = await consolidarCargos(id, tx);

      if (cuenta.estadoReserva !== 'En curso') {
        throw new ErrorDeNegocio(
          `No se puede hacer el check-out de una reserva "${cuenta.estadoReserva}": tiene que estar "En curso".`,
          409
        );
      }
      if (centavos(cuenta.saldo) > 0) {
        throw new ErrorDeNegocio(
          `La cuenta tiene un saldo pendiente de ${cuenta.saldo}. Registrá el pago antes de confirmar el check-out.`,
          409
        );
      }

      try {
        await reservasServicio.marcarCerrada(id, tx);
      } catch (err) {
        throw envolverErrorReservas(err);
      }

      // updateMany directo (no cambiarEstadoHabitacion): esa función
      // rechaza habitaciones dadas de baja, y una habitación desactivada a
      // mitad de la estadía no puede impedir que el huésped haga check-out.
      await tx.habitacion.updateMany({
        where: { id: { in: cuenta.habitaciones.map((h) => h.habitacionId) } },
        data: { estado: ESTADO_HABITACION_POST_CHECKOUT },
      });

      const notificaciones = [];
      for (const h of cuenta.habitaciones) {
        notificaciones.push(
          await tx.notificacion.create({
            data: {
              tipo: TIPO_NOTIFICACION_HOUSEKEEPING,
              habitacionId: h.habitacionId,
              reservaId: id,
              destinatarioArea: AREA_HOUSEKEEPING,
              canal: CANAL_INTERNO,
              mensaje: `Check-out completado: la habitación ${h.numero} (${h.tipo}) quedó pendiente de limpieza.`,
            },
          })
        );
      }

      return {
        reservaId: id,
        estadoReserva: 'Cerrada',
        totalAdeudado: cuenta.totalAdeudado,
        totalPagado: cuenta.totalPagado,
        habitaciones: cuenta.habitaciones.map((h) => ({
          habitacionId: h.habitacionId,
          numero: h.numero,
          estado: ESTADO_HABITACION_POST_CHECKOUT,
        })),
        notificaciones,
      };
    },
    { timeout: 15000, maxWait: 10000 }
  );
}

module.exports = {
  consolidarCargos,
  registrarVerificacion,
  listarVerificaciones,
  confirmarCheckOut,
  ErrorDeNegocio,
};
