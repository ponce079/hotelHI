const { OPCIONES_TRANSACCION } = require('../../lib/constantes');
const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { redondear } = require('../../lib/comprobantes');
const { conTipoPlano } = require('../../lib/tipoHabitacion');
const reservasServicio = require('../reservas/reservas.servicio');
const garantiaCheckOut = require('../garantias/garantiaEstadiaCheckOut.servicio');
const {
  TIPOS_CARGO_VERIFICACION,
  TIPO_VERIFICACION_SIN_NOVEDADES,
  DESCRIPCION_VERIFICACION_SIN_NOVEDADES,
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
//   (a) Etapa 4A (HU-96) — la suma de ReservaNoche.precioNoche de cada
//       habitación de la reserva (precio ya congelado noche por noche al
//       confirmar el alta o la última modificación; nunca se recalcula
//       contra la tarifa de hoy)
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
      reservaHabitaciones: {
        include: {
          habitacion: { include: { tipoHabitacion: { select: { nombre: true } } } },
          reservaNoches: { orderBy: { fecha: 'asc' } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!reserva) throw new ErrorDeNegocio('La reserva no existe.', 404);

  const noches = calcularNoches(reserva.fechaDesde, reserva.fechaHasta);

  // Etapa 4A — sin ReservaNoche no hay de dónde sacar el precio: nunca se
  // cae en silencio al viejo tarifaPorNoche de la habitación (eso
  // duplicaría el riesgo de cobrar algo distinto de lo que se vendió). Solo
  // puede pasar en una reserva anterior a esta etapa que todavía no corrió
  // el script de migración.
  const sinPrecioCongelado = reserva.reservaHabitaciones.filter((rh) => rh.reservaNoches.length === 0);
  if (sinPrecioCongelado.length > 0) {
    throw new ErrorDeNegocio(
      `La reserva no tiene precio de alojamiento cargado para: ${sinPrecioCongelado
        .map((rh) => rh.habitacion.numero)
        .join(', ')}. Puede ser una reserva anterior a la Etapa 4A: correr el script de migración.`,
      409
    );
  }

  const habitaciones = reserva.reservaHabitaciones.map((rh) => {
    const detalleNoches = rh.reservaNoches.map((n) => ({
      fecha: n.fecha,
      precioNoche: Number(n.precioNoche),
      origen: n.origen,
    }));
    const nochesHabitacion = detalleNoches.length;
    const subtotal = redondear(detalleNoches.reduce((acc, n) => acc + n.precioNoche, 0));
    return {
      habitacionId: rh.habitacion.id,
      numero: rh.habitacion.numero,
      ...conTipoPlano(rh.habitacion),
      // Promedio informativo (las noches pueden valer distinto entre sí
      // por temporada/día de semana) — el subtotal real es la suma de
      // detalleNoches, no noches × este promedio. Etapa 4C: renombrado de
      // tarifaPorNoche a promedioPorNoche — ya no queda ninguna clave con
      // el nombre de la columna eliminada de Habitacion, ni siquiera una
      // que en realidad nunca la leyó (este valor siempre fue un cálculo,
      // no la columna).
      promedioPorNoche: redondear(subtotal / nochesHabitacion),
      noches: nochesHabitacion,
      detalleNoches,
      subtotal,
    };
  });

  const consumosDb = await cliente.consumoServicioAdicional.findMany({
    where: { reservaId: id, anulado: false },
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
    habitacionId: v.habitacionId,
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
  // Lo pagado por encima de lo adeudado (ej. un descuento del gerente sobre una tarifa no
  // reembolsable ya pagada). Antes quedaba oculto: el saldo se truncaba en 0 y nadie lo veía.
  const saldoAFavor = Math.max(0, redondear(totalPagado - totalAdeudado));
  for (const h of habitaciones) {
    h.adicionales = redondear(
      consumos.filter((c) => c.habitacionId === h.habitacionId).reduce((total, c) => total + c.monto, 0)
    );
  }

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
    saldoAFavor,
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
  // "Sin novedades" (ver checkOut.constantes.js): mismo registro, sin
  // monto — es el único tipo que puede tener importe 0, todos los demás
  // (Daño/Faltante/ConsumoNoRegistrado) siguen exigiendo un monto > 0.
  const esSinNovedades = tipo === TIPO_VERIFICACION_SIN_NOVEDADES;

  if (!esSinNovedades && !TIPOS_CARGO_VERIFICACION.includes(tipo)) {
    throw new ErrorDeNegocio(
      `tipo inválido. Valores permitidos: ${TIPOS_CARGO_VERIFICACION.join(', ')} o ${TIPO_VERIFICACION_SIN_NOVEDADES}`
    );
  }
  const desc = String(descripcion ?? (esSinNovedades ? DESCRIPCION_VERIFICACION_SIN_NOVEDADES : '')).trim();
  if (!desc) throw new ErrorDeNegocio('La descripción es obligatoria: hay que dejar qué se encontró.');
  if (desc.length > LIMITES_VERIFICACION.descripcion) {
    throw new ErrorDeNegocio(`La descripción no puede superar ${LIMITES_VERIFICACION.descripcion} caracteres.`);
  }
  const importe = esSinNovedades ? 0 : Number(monto);
  if (!esSinNovedades && (!Number.isFinite(importe) || importe <= 0)) {
    throw new ErrorDeNegocio('monto debe ser un número mayor a 0.');
  }
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

      const habitaciones = await tx.reservaHabitacion.findMany({ where: { reservaId: id } });
      const habitacionId = data.habitacionId
        ? idValido(data.habitacionId, 'habitacionId')
        : habitaciones.length === 1
          ? habitaciones[0].habitacionId
          : null;
      if (!habitaciones.some((h) => h.habitacionId === habitacionId)) {
        throw new ErrorDeNegocio('Seleccioná una habitación de la reserva.');
      }
      const cargo = await tx.cargoVerificacionCheckout.create({
        data: { reservaId: id, habitacionId, tipo, descripcion: desc, monto: redondear(importe), registradoPor: quien },
      });
      const cuenta = await consolidarCargos(id, tx);
      return { cargo, cuenta };
    },
    OPCIONES_TRANSACCION
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
//   4. cada habitación 'ocupada' -> 'en limpieza' (HU-51, misma transacción).
//      Una habitación que NO está 'ocupada' no se pisa (ver abajo).
//   5. una Notificacion 'Housekeeping' por habitación que cambió o que
//      quedó con una orden abierta (HU-52; es el registro del envío)
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

  const cierre = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${id} FOR UPDATE`;
      const cuenta = await consolidarCargos(id, tx);

      if (cuenta.estadoReserva !== 'En curso') {
        throw new ErrorDeNegocio(
          `No se puede hacer el check-out de una reserva "${cuenta.estadoReserva}": tiene que estar "En curso".`,
          409
        );
      }
      // HU-87 (re-auditoría del 2026-09-21): hasta acá el único gate de la
      // verificación era el botón deshabilitado en la pantalla — un POST
      // directo a /confirmar, sin pasar nunca por /verificaciones, cerraba
      // la reserva igual. Ahora se exige al menos un registro real (con
      // cargo o "sin novedades", da lo mismo cuál) antes de aceptar el
      // cierre. Se re-consulta con `tx` (mismo lock de la reserva de
      // arriba) para no aceptar un registro que se está por perder por un
      // rollback concurrente.
      const huboVerificacion = cuenta.habitaciones.every((h) =>
        cuenta.verificaciones.some(
          (v) => v.habitacionId === h.habitacionId || (!v.habitacionId && cuenta.habitaciones.length === 1)
        )
      );
      if (!huboVerificacion) {
        throw new ErrorDeNegocio(
          'Falta verificar la habitación antes de confirmar el check-out (HU-87): registrá lo que encontraste o marcá "Verificación sin novedades".',
          409
        );
      }
      if (centavos(cuenta.saldo) > 0) {
        throw new ErrorDeNegocio(
          `La cuenta tiene un saldo pendiente de ${cuenta.saldo}. Registrá el pago antes de confirmar el check-out.`,
          409
        );
      }

      // Saldo a favor: se devuelve en vez de truncarse en cero sin explicación.
      let devolucionSaldoAFavor = 0;
      if (centavos(cuenta.saldoAFavor) > 0) {
        const primerPago = await tx.pagoEstadia.findFirst({
          where: { reservaId: id, anulado: false },
          include: { medios: true },
          orderBy: { id: 'asc' },
        });
        await garantiaCheckOut.registrarDevolucionSaldoAFavor(tx, {
          reservaId: id,
          monto: cuenta.saldoAFavor,
          medioPago: primerPago?.medios?.[0]?.medioPago,
        });
        devolucionSaldoAFavor = cuenta.saldoAFavor;
      }

      try {
        await reservasServicio.marcarCerrada(id, tx);
      } catch (err) {
        throw envolverErrorReservas(err);
      }
      const salidaReal = new Date();
      await tx.ocupanteReserva.updateMany({
        where: { reservaId: id, estado: 'Alojado' },
        data: { estado: 'Retirado', salidaReal, identidadActiva: null },
      });
      await tx.asignacionOcupanteHabitacion.updateMany({
        where: { ocupante: { reservaId: id }, hasta: null },
        data: { hasta: salidaReal },
      });

      // Estado de las habitaciones al salir el huésped.
      //
      // NO se hace un updateMany a ciegas: si a mitad de la estadía se cargó
      // una orden de mantenimiento (ej. se rompió el aire), la habitación
      // está en 'mantenimiento' con estadoAnterior = 'ocupada'. Pisarla con
      // 'en limpieza' dejaría la orden huérfana; y dejarla tal cual tiene un
      // problema peor: al resolverse la orden, resolverOrdenMantenimiento la
      // restauraría a 'ocupada' — con el huésped ya afuera, y desde
      // 'ocupada' no hay transición manual de salida, así que quedaría
      // trabada. Por eso:
      //   - 'ocupada'      -> 'en limpieza'
      //   - 'mantenimiento'-> se queda así (la orden sigue abierta) y se
      //                       reescribe estadoAnterior a 'en limpieza', para
      //                       que al resolverse pase a limpieza y no a ocupada
      //   - cualquier otro -> no se toca (no es una habitación ocupada)
      // El check-out NO se bloquea por la orden: el huésped ya pagó y se va;
      // que la habitación tenga un arreglo pendiente no depende de él.
      //
      // Se bloquean las filas antes de leerlas para que el estado que se ve
      // sea el mismo que se va a escribir.
      //
      // Las escrituras se agrupan por tipo de cambio (una sentencia por cada una) para que
      // las consultas no crezcan con la cantidad de habitaciones de la reserva.
      const habitacionIds = cuenta.habitaciones.map((h) => h.habitacionId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM habitaciones WHERE id IN (${Prisma.join(habitacionIds)}) ORDER BY id FOR UPDATE`
      );
      const actuales = await tx.habitacion.findMany({ where: { id: { in: habitacionIds } } });
      const actualPorId = new Map(actuales.map((h) => [h.id, h]));

      const habitaciones = [];
      const datosNotificaciones = [];
      const aLimpiar = [];
      const reescribirEstadoAnterior = [];
      for (const h of cuenta.habitaciones) {
        const actual = actualPorId.get(h.habitacionId);
        let estadoFinal = actual.estado;
        let observacion = null;

        if (actual.estado === 'ocupada') {
          aLimpiar.push(h.habitacionId);
          estadoFinal = ESTADO_HABITACION_POST_CHECKOUT;
          observacion = `quedó ${ESTADO_HABITACION_POST_CHECKOUT}.`;
        } else if (actual.estado === 'mantenimiento') {
          if (!actual.estadoAnterior || actual.estadoAnterior === 'ocupada') {
            reescribirEstadoAnterior.push(h.habitacionId);
          }
          observacion = `sigue en mantenimiento (orden sin resolver). Al resolverla pasa a ${ESTADO_HABITACION_POST_CHECKOUT}.`;
        }

        habitaciones.push({ habitacionId: h.habitacionId, numero: h.numero, estado: estadoFinal, observacion });

        if (observacion) {
          const mensaje =
            actual.estado === 'mantenimiento'
              ? `Check-out completado: la habitación ${h.numero} (${h.tipo}) sigue en mantenimiento por una orden sin resolver. Cuando se resuelva, pasa a ${ESTADO_HABITACION_POST_CHECKOUT}.`
              : `Check-out completado: la habitación ${h.numero} (${h.tipo}) quedó pendiente de limpieza.`;
          datosNotificaciones.push({
            tipo: TIPO_NOTIFICACION_HOUSEKEEPING,
            habitacionId: h.habitacionId,
            reservaId: id,
            destinatarioArea: AREA_HOUSEKEEPING,
            canal: CANAL_INTERNO,
            mensaje,
          });
        }
      }

      if (aLimpiar.length > 0) {
        await tx.habitacion.updateMany({
          where: { id: { in: aLimpiar } },
          data: { estado: ESTADO_HABITACION_POST_CHECKOUT },
        });
      }
      if (reescribirEstadoAnterior.length > 0) {
        await tx.habitacion.updateMany({
          where: { id: { in: reescribirEstadoAnterior } },
          data: { estadoAnterior: ESTADO_HABITACION_POST_CHECKOUT },
        });
      }
      let notificaciones = [];
      if (datosNotificaciones.length > 0) {
        await tx.notificacion.createMany({ data: datosNotificaciones });
        notificaciones = await tx.notificacion.findMany({
          where: {
            reservaId: id,
            tipo: TIPO_NOTIFICACION_HOUSEKEEPING,
            habitacionId: { in: datosNotificaciones.map((n) => n.habitacionId) },
          },
          orderBy: { id: 'asc' },
        });
      }

      return {
        reservaId: id,
        estadoReserva: 'Cerrada',
        totalAdeudado: cuenta.totalAdeudado,
        totalPagado: cuenta.totalPagado,
        devolucionSaldoAFavor,
        habitaciones,
        notificaciones,
      };
    },
    OPCIONES_TRANSACCION
  );

  // Con la cuenta ya cerrada: se libera la preautorización o se devuelve el depósito. Va FUERA
  // de la transacción (la pasarela es de red) y no puede hacer fallar un check-out ya hecho.
  const garantia = await garantiaCheckOut.cerrarGarantiaDeEstadia(id);
  return { ...cierre, garantia };
}

module.exports = {
  consolidarCargos,
  registrarVerificacion,
  listarVerificaciones,
  confirmarCheckOut,
  ErrorDeNegocio,
};
