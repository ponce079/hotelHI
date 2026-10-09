// Rediseño del check-in — consultas de apoyo para la pantalla única (solo lectura).
//   - listarLlegadas: reservas Confirmadas que ingresan HOY (hora argentina), filtradas en el
//     servidor, más la cantidad de Confirmadas anteriores a hoy (no-show pendiente).
//   - previaOcupacion: cuánto cambia el total si cambia la ocupación (lógica de modificarReserva
//     con soloPrevia, sin escribir nada).
const prisma = require("../../lib/prisma");
const { hoyComoFechaUTC, combinarFechaConHoraArgentina } = require("../../lib/fechas");
const { conTipoPlano } = require("../../lib/tipoHabitacion");
const { normalizarNumeroDocumento } = require("../../lib/documento");
const reservasServicio = require("../reservas/reservas.servicio");
const { ESTADO_RESERVA, ACCION_NOMBRE_WEB_DISTINTO } = require("../reservas/reservas.constantes");
const { CONCEPTO_SENIA } = require("../pagos-estadia/pagoEstadia.constantes");
const { CONCEPTO_PAGO_ANTICIPADO, TIPO_GARANTIA } = require("../garantias/garantias.constantes");

const DIA = 24 * 60 * 60 * 1000;
const MAX_LLEGADAS = 200;

function calcularNoches(desde, hasta) {
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / DIA);
}

// Datos de una reserva para la lista: los tres listados (de hoy, atrasadas, ingresadas hoy) comparten forma.
const INCLUDE_LLEGADA = {
  huesped: true,
  planTarifario: true,
  reservaHabitaciones: {
    include: {
      habitacion: { include: { tipoHabitacion: { select: { nombre: true } } } },
      reservaNoches: { select: { precioNoche: true } },
    },
  },
  // Lo que se pagó por adelantado: el "Pago anticipado" de la garantía con tarjeta (prepago o NRF) o,
  // en reservas anteriores, la seña (concepto histórico).
  pagosEstadia: {
    where: { concepto: { in: [CONCEPTO_PAGO_ANTICIPADO, CONCEPTO_SENIA] }, anulado: false },
    include: { medios: true },
  },
  // Tarjeta que dejó la reserva en garantía (solo marca y últimos 4: sin token ni referencias).
  garantiaReserva: { select: { tipo: true, marca: true, ultimos4: true, estado: true } },
  // Marca de la reserva web cuyo nombre declarado no coincide con la ficha del documento (regla 2.6).
  historialEstadia: { where: { accion: ACCION_NOMBRE_WEB_DISTINTO }, select: { id: true }, take: 1 },
  // Solo lo que se muestra de la reserva web (hora estimada y pedidos del huésped): nunca el email, el teléfono ni la tarjeta.
  datosWeb: { select: { horaEstimadaLlegada: true, solicitudesEspeciales: true } },
};

function filtroDeTexto(q) {
  const texto = String(q ?? "").trim().slice(0, 100);
  if (!texto) return {};
  const documentoLimpio = normalizarNumeroDocumento(texto);
  return {
    OR: [
      { codigoConfirmacion: { contains: texto } },
      { huesped: { nombre: { contains: texto } } },
      { huesped: { numeroDocumento: { contains: texto } } },
      // El número se guarda sin puntos, guiones ni espacios: "45.112.902" encuentra "45112902"
      // (mismo criterio que listarReservas).
      ...(documentoLimpio && documentoLimpio !== texto ? [{ huesped: { numeroDocumento: { contains: documentoLimpio } } }] : []),
      // Número de habitación de la reserva: igualdad exacta ("305" no encuentra la "3050").
      { reservaHabitaciones: { some: { habitacion: { numero: texto } } } },
    ],
  };
}

function armarLlegada(r) {
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
  // Los pagos por adelantado tal cual se guardaron: importes y la referencia, sin armar datos de tarjeta.
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
      preferencias: r.huesped?.preferencias ?? null,
    },
    nombreWebDistinto: (r.historialEstadia?.length ?? 0) > 0,
    esWeb: Boolean(r.datosWeb),
    horaEstimadaLlegada: r.datosWeb?.horaEstimadaLlegada ?? null,
    solicitudesEspeciales: r.datosWeb?.solicitudesEspeciales ?? null,
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
      // "Pago anticipado" (prepago o tarifa no reembolsable) o "Seña" (histórica): la pantalla las rotula distinto.
      concepto: r.pagosEstadia.some((p) => p.concepto === CONCEPTO_PAGO_ANTICIPADO) ? CONCEPTO_PAGO_ANTICIPADO : medios.length > 0 ? CONCEPTO_SENIA : null,
      importe: medios.reduce((a, m) => a + Number(m.importe), 0),
      medios: medios.map((m) => ({ medioPago: m.medioPago, importe: Number(m.importe), referencia: m.referencia })),
    },
    // Tarjeta en garantía de la reserva (null si no dejó ninguna): el check-in la preautoriza sin pedirla de nuevo.
    garantia:
      r.garantiaReserva?.tipo === TIPO_GARANTIA.TARJETA
        ? { tipo: r.garantiaReserva.tipo, marca: r.garantiaReserva.marca, ultimos4: r.garantiaReserva.ultimos4 }
        : null,
  };
}

// Reservas cuyo PRIMER ingreso de una persona (mínimo OcupanteReserva.ingresoReal) cae en [desde, hasta). Una reserva que
// ya tenía un ingreso anterior no entra, aunque hoy se le haya sumado una persona. Sin filtrar por estado: una estadía
// ingresada hoy y ya cerrada también cuenta. Una sola agrupación y una sola consulta por lote.
async function listarIngresadas({ desde, hasta, filtroTexto }) {
  const grupos =
    (await prisma.ocupanteReserva.groupBy({
      by: ["reservaId"],
      where: { ingresoReal: { not: null } },
      _min: { ingresoReal: true },
      having: { ingresoReal: { _min: { gte: desde, lt: hasta } } },
    })) ?? [];
  if (grupos.length === 0) return [];
  const horaPorReserva = new Map(grupos.map((g) => [g.reservaId, g._min.ingresoReal]));
  const reservas = await prisma.reserva.findMany({
    where: { id: { in: [...horaPorReserva.keys()] }, ...filtroTexto },
    include: INCLUDE_LLEGADA,
  });
  return reservas
    .map((r) => ({ ...armarLlegada(r), horaIngreso: horaPorReserva.get(r.id).toISOString() }))
    .sort((a, b) => (a.horaIngreso < b.horaIngreso ? 1 : a.horaIngreso > b.horaIngreso ? -1 : 0))
    .slice(0, MAX_LLEGADAS);
}

// `reservas`: Confirmadas que llegan hoy. `atrasadas` (HU-118): Confirmadas que llegaban AYER y siguen en el hotel
// (salen hoy o después): todavía se pueden ingresar. Las anteriores a ayer no se listan: son candidatas a no-show
// (`pendientesNoShow`). `anterioresPendientes` (< hoy) se mantiene igual: lo usan el menú y la tarjeta de Reservas.
// `ingresadasHoy`: reservas cuyo primer ingreso fue hoy, en hora argentina.
async function listarLlegadas({ q } = {}) {
  const hoy = hoyComoFechaUTC();
  const manana = new Date(hoy.getTime() + DIA);
  const ayer = new Date(hoy.getTime() - DIA);
  const filtroTexto = filtroDeTexto(q);
  const inicioHoy = combinarFechaConHoraArgentina(hoy, 0);
  const finHoy = new Date(inicioHoy.getTime() + DIA);
  const [reservas, atrasadas, anterioresPendientes, pendientesNoShow, ingresadasHoy] = await Promise.all([
    prisma.reserva.findMany({
      where: { estado: ESTADO_RESERVA.CONFIRMADA, fechaDesde: { gte: hoy, lt: manana }, ...filtroTexto },
      include: INCLUDE_LLEGADA,
      orderBy: [{ codigoConfirmacion: "asc" }],
      take: MAX_LLEGADAS,
    }),
    prisma.reserva.findMany({
      where: { estado: ESTADO_RESERVA.CONFIRMADA, fechaDesde: { gte: ayer, lt: hoy }, fechaHasta: { gte: hoy }, ...filtroTexto },
      include: INCLUDE_LLEGADA,
      orderBy: [{ codigoConfirmacion: "asc" }],
      take: MAX_LLEGADAS,
    }),
    prisma.reserva.count({ where: { estado: ESTADO_RESERVA.CONFIRMADA, fechaDesde: { lt: hoy } } }),
    prisma.reserva.count({ where: { estado: ESTADO_RESERVA.CONFIRMADA, fechaDesde: { lt: ayer } } }),
    listarIngresadas({ desde: inicioHoy, hasta: finHoy, filtroTexto }),
  ]);

  return {
    fecha: hoy.toISOString().slice(0, 10),
    anterioresPendientes,
    pendientesNoShow,
    reservas: reservas.map(armarLlegada),
    atrasadas: atrasadas.map(armarLlegada),
    ingresadasHoy,
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
