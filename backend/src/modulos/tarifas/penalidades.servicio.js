// Cálculo de penalidades por cancelación o no-show (HU-98) — Etapa 4B de
// tarifas por temporada. Lógica de negocio pura, de solo lectura: no
// persiste nada, no cobra nada y no conoce HTTP. Reutiliza el precio ya
// congelado por noche (ReservaNoche, HU-96) en vez de recalcular nada
// contra el motor de cotización.
//
// Corrección de negocio (2026-09-30): un ajuste manual de precio (HU-97,
// cortesía o descuento) es una concesión condicionada a que la estadía
// ocurra de verdad — no reduce lo que correspondería cobrar si el huésped
// cancela o no se presenta. Por eso, para CADA noche, el monto que entra al
// cálculo de penalidad es: si la noche está ajustada, `precioOriginal` (el
// precio de antes del ajuste manual); si no, `precioNoche` tal cual. Aplica
// igual a la primera noche que al total de la estadía — ver
// montoPenalizable() más abajo, único punto que lee el precio de una noche
// para este cálculo.
//
// NO se conecta a cancelarReserva (reservas.servicio.js): esa función sigue
// con su regla fija de 24hs, sin cambios. Este archivo solo expone el
// cálculo — cómo y cuándo aplicarlo a una cancelación real es una decisión
// del equipo de garantía y cancelaciones (ver docs/penalidades.md).

const prisma = require("../../lib/prisma");
const { combinarFechaConHoraArgentina } = require("../../lib/fechas");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const { TIPO_PENALIDAD, TIPOS_PENALIDAD, PENALIDAD_NO_SHOW, HORA_CHECKIN } = require("./tarifas.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

const INCLUDE_PENALIDAD = {
  planTarifario: true,
  reservaHabitaciones: {
    include: {
      habitacion: { select: { numero: true } },
      reservaNoches: { orderBy: { fecha: "asc" } },
    },
  },
};

// Único punto que decide qué precio de una noche entra al cálculo de
// penalidad: el ajuste manual de HU-97 es una concesión condicionada a que
// la estadía ocurra, así que una noche ajustada penaliza por su
// precioOriginal (antes del ajuste), no por el precioNoche ya rebajado.
function montoPenalizable(noche) {
  return noche.ajustada ? Number(noche.precioOriginal) : Number(noche.precioNoche);
}

// La "primera noche" de una reserva de varias habitaciones es la suma de la
// primera noche DE CADA HABITACIÓN (regla 10.d) — no "la fecha más
// temprana de toda la reserva" ni "la primera habitación nada más".
function calcularPrimeraNochePorHabitacion(reservaHabitaciones) {
  return reservaHabitaciones.map((rh) => {
    const noches = rh.reservaNoches ?? [];
    const primera = noches[0] ?? null;
    return {
      habitacionId: rh.habitacionId,
      numero: rh.habitacion?.numero ?? null,
      primeraNoche: primera ? montoPenalizable(primera) : 0,
    };
  });
}

function sumarTotalEstadia(reservaHabitaciones) {
  return reservaHabitaciones.reduce(
    (acc, rh) => acc + (rh.reservaNoches ?? []).reduce((a, n) => a + montoPenalizable(n), 0),
    0
  );
}

// momento es el instante de la cancelación/no-show — default "ahora" para
// quien llama sin pasar nada (el endpoint HU-98 siempre usa "ahora").
async function calcularPenalidad({ reservaId, tipo, momento = new Date() }, cliente = prisma) {
  if (!Number.isInteger(Number(reservaId)) || Number(reservaId) < 1) {
    throw new ErrorDeNegocio("reservaId debe ser un número entero mayor a 0.");
  }
  if (!TIPOS_PENALIDAD.includes(tipo)) {
    throw new ErrorDeNegocio(`tipo debe ser uno de: ${TIPOS_PENALIDAD.join(", ")}.`);
  }

  const reserva = await cliente.reserva.findUnique({
    where: { id: Number(reservaId) },
    include: INCLUDE_PENALIDAD,
  });
  if (!reserva) throw new ErrorDeNegocio("La reserva no existe.", 404);

  // Etapa 4B (aprobación del usuario): la penalidad solo tiene sentido
  // ANTES de que la estadía se resuelva de una forma u otra — una reserva
  // En curso ya tuvo check-in (no hay cancelación/no-show posible), y una
  // Cerrada o Cancelada ya cerró su historia por otro camino.
  if (reserva.estado !== ESTADO_RESERVA.CONFIRMADA) {
    throw new ErrorDeNegocio(
      `La penalidad solo se calcula para reservas confirmadas; esta reserva está "${reserva.estado}".`
    );
  }

  const plan = reserva.planTarifario;
  if (!plan) {
    // No debería pasar después de la migración de la Etapa 4A (todas las
    // reservas quedaron con un plan), pero una reserva sin plan no tiene
    // ninguna política de cancelación/no-show de la que partir.
    throw new ErrorDeNegocio("La reserva no tiene un plan tarifario asociado: no se puede calcular la penalidad.");
  }

  const primeraNochePorHabitacion = calcularPrimeraNochePorHabitacion(reserva.reservaHabitaciones);
  const primeraNocheTotal = primeraNochePorHabitacion.reduce((acc, h) => acc + h.primeraNoche, 0);
  const totalEstadia = sumarTotalEstadia(reserva.reservaHabitaciones);

  if (tipo === TIPO_PENALIDAD.CANCELACION) {
    if (plan.reembolsable) {
      const limiteSinCargo = new Date(
        combinarFechaConHoraArgentina(new Date(reserva.fechaDesde), HORA_CHECKIN.hora, HORA_CHECKIN.minuto).getTime() -
          Number(plan.horasCancelacionSinCargo ?? 0) * 60 * 60 * 1000
      );
      if (new Date(momento).getTime() <= limiteSinCargo.getTime()) {
        return {
          aplica: false,
          monto: 0,
          tipo,
          regla: "SIN_CARGO",
          mensaje: "Cancelación sin cargo.",
          limiteSinCargo,
          detallePorHabitacion: primeraNochePorHabitacion,
        };
      }
      return {
        aplica: true,
        monto: primeraNocheTotal,
        tipo,
        regla: "PRIMERA_NOCHE",
        mensaje: "Cancelación fuera de plazo: se cobra la primera noche.",
        limiteSinCargo,
        detallePorHabitacion: primeraNochePorHabitacion,
      };
    }
    return {
      aplica: true,
      monto: totalEstadia,
      tipo,
      regla: "TOTAL_NO_REEMBOLSABLE",
      mensaje: "Tarifa no reembolsable.",
      limiteSinCargo: null,
      detallePorHabitacion: primeraNochePorHabitacion,
    };
  }

  // NO_SHOW
  if (plan.penalidadNoShow === PENALIDAD_NO_SHOW.TOTAL_ESTADIA) {
    return {
      aplica: true,
      monto: totalEstadia,
      tipo,
      regla: "TOTAL_ESTADIA",
      mensaje: "No-show: se cobra la estadía completa.",
      limiteSinCargo: null,
      detallePorHabitacion: primeraNochePorHabitacion,
    };
  }
  return {
    aplica: true,
    monto: primeraNocheTotal,
    tipo,
    regla: "PRIMERA_NOCHE",
    mensaje: "No-show: se cobra la primera noche.",
    limiteSinCargo: null,
    detallePorHabitacion: primeraNochePorHabitacion,
  };
}

module.exports = { calcularPenalidad, ErrorDeNegocio };
