// Cancelación online de "Mi reserva" (HU-104, decisión 14): solo SIN cargo.
// Usa cancelarReserva y calcularPenalidad tal cual (sin modificarlas). En
// una reserva web flexible no hay pagos (la garantía no es un PagoEstadia),
// así que cancelarReserva no anula nada; una reserva con algún pago activo
// (por ejemplo, una seña del mostrador) no se cancela online.
const prisma = require("../../lib/prisma");
const reservasServicio = require("../reservas/reservas.servicio");
const { ErrorWeb, CODIGO } = require("./ecommerce.errores");
const emailWeb = require("./emailWeb.servicio");
const { armarRespuestaMiReserva } = require("./miReserva");
const { buscarReserva, evaluar, conPiso } = require("./miReserva.servicio");

const MOTIVO_CANCELACION_WEB = "Cancelada por el huésped desde la web";

// POST /api/web/mi-reserva/cancelar — body { codigo, email, montoPenalidadAceptado }.
function cancelarMiReserva(cuerpo) {
  return conPiso(async () => {
    const { reserva, emailReserva } = await buscarReserva(cuerpo);
    // Idempotente: una reserva ya cancelada responde lo mismo, sin otro email.
    if (reserva.estado === "Cancelada") return { estado: "Cancelada", penalidadCobrada: 0 };

    // Todo se recalcula en el servidor (pudo pasar el plazo entre la consulta y el clic).
    const cancelacion = await evaluar(reserva);
    if (!cancelacion.puedeCancelarOnline) {
      throw new ErrorWeb(409, CODIGO.PENALIDAD_CAMBIO, cancelacion.motivo ?? undefined, {
        montoNuevo: cancelacion.penalidad?.monto ?? 0,
        motivo: cancelacion.motivo,
      });
    }
    // Online solo se cancela sin cargo: el huésped tiene que haber aceptado 0.
    if (Number(cuerpo?.montoPenalidadAceptado) !== 0 || cuerpo?.montoPenalidadAceptado === null || cuerpo?.montoPenalidadAceptado === "") {
      throw new ErrorWeb(409, CODIGO.PENALIDAD_CAMBIO, undefined, { montoNuevo: 0, motivo: null });
    }

    try {
      await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: MOTIVO_CANCELACION_WEB });
    } catch (err) {
      // Otra cancelación ganó la carrera: misma respuesta idempotente.
      const actual = await prisma.reserva.findUnique({ where: { id: reserva.id }, select: { estado: true } });
      if (actual?.estado === "Cancelada") return { estado: "Cancelada", penalidadCobrada: 0 };
      throw err;
    }

    const datos = armarRespuestaMiReserva({ ...reserva, estado: "Cancelada" }, null);
    const email = await emailWeb.enviarCancelacion(datos, emailReserva);
    return { estado: "Cancelada", penalidadCobrada: 0, email };
  });
}

module.exports = { cancelarMiReserva, MOTIVO_CANCELACION_WEB };
