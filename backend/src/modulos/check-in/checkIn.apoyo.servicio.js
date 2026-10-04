// Rediseño del check-in — consultas de apoyo para la pantalla única (solo lectura).
//   - listarLlegadas: reservas Confirmadas que ingresan HOY (hora argentina), filtradas en el
//     servidor, más la cantidad de Confirmadas anteriores a hoy (no-show pendiente).
//   - previaOcupacion: cuánto cambia el total si cambia la ocupación (lógica de modificarReserva
//     con soloPrevia, sin escribir nada).
const prisma = require("../../lib/prisma");
const { hoyComoFechaUTC } = require("../../lib/fechas");
const { conTipoPlano } = require("../../lib/tipoHabitacion");
const reservasServicio = require("../reservas/reservas.servicio");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const { CONCEPTO_SENIA } = require("../pagos-estadia/pagoEstadia.constantes");

const DIA = 24 * 60 * 60 * 1000;
const MAX_LLEGADAS = 200;

function calcularNoches(desde, hasta) {
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / DIA);
}

async function listarLlegadas({ q } = {}) {
  const hoy = hoyComoFechaUTC();
  const manana = new Date(hoy.getTime() + DIA);
  const texto = String(q ?? "").trim().slice(0, 100);
  const filtroTexto = texto
    ? {
        OR: [
          { codigoConfirmacion: { contains: texto } },
          { huesped: { nombre: { contains: texto } } },
          { huesped: { numeroDocumento: { contains: texto } } },
        ],
      }
    : {};
  const [reservas, anterioresPendientes] = await Promise.all([
    prisma.reserva.findMany({
      where: { estado: ESTADO_RESERVA.CONFIRMADA, fechaDesde: { gte: hoy, lt: manana }, ...filtroTexto },
      include: {
        huesped: true,
        planTarifario: true,
        reservaHabitaciones: {
          include: {
            habitacion: { include: { tipoHabitacion: { select: { nombre: true } } } },
            reservaNoches: { select: { precioNoche: true } },
          },
        },
        pagosEstadia: {
          where: { concepto: CONCEPTO_SENIA, anulado: false },
          include: { medios: true },
        },
      },
      orderBy: [{ codigoConfirmacion: "asc" }],
      take: MAX_LLEGADAS,
    }),
    prisma.reserva.count({ where: { estado: ESTADO_RESERVA.CONFIRMADA, fechaDesde: { lt: hoy } } }),
  ]);

  return {
    fecha: hoy.toISOString().slice(0, 10),
    anterioresPendientes,
    reservas: reservas.map((r) => {
      const habitaciones = r.reservaHabitaciones.map((rh) => ({
        id: rh.habitacion.id,
        numero: rh.habitacion.numero,
        ...conTipoPlano(rh.habitacion),
        capacidad: rh.habitacion.capacidad,
        estado: rh.habitacion.estado,
        adultos: rh.adultos,
        menores: rh.menores,
        totalAlojamiento: rh.reservaNoches.reduce((a, n) => a + Number(n.precioNoche), 0),
      }));
      // Seña tal como existe hoy (HU-88): importes y la referencia guardada, sin armar datos de tarjeta.
      const medios = r.pagosEstadia.flatMap((p) => p.medios);
      return {
        id: r.id,
        codigoConfirmacion: r.codigoConfirmacion,
        fechaDesde: r.fechaDesde,
        fechaHasta: r.fechaHasta,
        noches: calcularNoches(r.fechaDesde, r.fechaHasta),
        titular: {
          nombre: r.huesped?.nombre ?? null,
          nombres: r.huesped?.nombres ?? null,
          apellido: r.huesped?.apellido ?? null,
          tipoDocumento: r.huesped?.tipoDocumento ?? null,
          numeroDocumento: r.huesped?.numeroDocumento ?? null,
          paisDocumento: r.huesped?.paisDocumento ?? null,
        },
        habitaciones,
        plan: r.planTarifario
          ? {
              id: r.planTarifario.id,
              codigo: r.planTarifario.codigo,
              nombre: r.planTarifario.nombre,
              reembolsable: r.planTarifario.reembolsable,
            }
          : null,
        totalAlojamiento: habitaciones.reduce((a, h) => a + h.totalAlojamiento, 0),
        senia: {
          registrada: medios.length > 0,
          importe: medios.reduce((a, m) => a + Number(m.importe), 0),
          medios: medios.map((m) => ({ medioPago: m.medioPago, importe: Number(m.importe), referencia: m.referencia })),
        },
      };
    }),
  };
}

async function previaOcupacion(reservaId, { habitaciones } = {}) {
  const { ErrorDeNegocio } = require("./checkIn.servicio");
  let reserva;
  try {
    reserva = await reservasServicio.obtenerReserva(reservaId);
  } catch (err) {
    if (err instanceof reservasServicio.ErrorDeNegocio) throw new ErrorDeNegocio(err.message, err.statusCode);
    throw err;
  }
  if (reserva.estado !== ESTADO_RESERVA.CONFIRMADA)
    throw new ErrorDeNegocio("La vista previa solo aplica a una reserva confirmada que todavía no ingresó.", 409);
  const { normalizarHabitaciones } = require("./confirmacionAtomica");
  const filas = normalizarHabitaciones(reserva, habitaciones);
  for (const f of filas) {
    if (!Number.isInteger(f.adultos) || f.adultos < 1)
      throw new ErrorDeNegocio(`Habitación ${f.anterior.numero}: tiene que ingresar al menos un adulto.`);
    if (!Number.isInteger(f.menores) || f.menores < 0)
      throw new ErrorDeNegocio(`Habitación ${f.anterior.numero}: la cantidad de menores no es válida.`);
  }
  // El precio sale siempre de la habitación reservada: un cambio por otra del mismo tipo no lo modifica.
  const previa = await reservasServicio.modificarReserva(reserva.id, {
    habitaciones: filas.map((f) => ({ habitacionId: f.anterior.id, adultos: f.adultos, menores: f.menores })),
    soloPrevia: true,
  });
  return {
    totalAnterior: previa.totalAnterior,
    totalNuevo: previa.totalNuevo,
    diferencia: previa.diferencia,
    diferenciaPorNoche: previa.diferenciaPorNoche,
    mensajeNoReembolsable: previa.mensajeNoReembolsable,
    mensajeAjustePerdido: previa.mensajeAjustePerdido,
    porHabitacion: previa.porHabitacion.map((h) => {
      const fila = filas.find((f) => f.anterior.id === h.habitacionId);
      return { ...h, habitacionIdAnterior: h.habitacionId, habitacionId: fila?.habitacionId ?? h.habitacionId };
    }),
  };
}

module.exports = { listarLlegadas, previaOcupacion };
