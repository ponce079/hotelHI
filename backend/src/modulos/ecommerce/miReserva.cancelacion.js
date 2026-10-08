// Cancelación online de "Mi reserva" (HU-104), con o sin cargo.
//
// Usa cancelarReserva de Ricardo tal cual (que cierra la reserva con cerrarReservaConPenalidad: calcula la penalidad
// con calcularPenalidad, retiene/cobra a la tarjeta de la garantía y deja la deuda visible si el cobro falla). Acá solo
// se decide SI se ofrece online (evaluar), se exige que el huésped haya visto y aceptado el cargo, y se informa el
// resultado. Con cargo hacen falta DOS datos del cliente: `aceptaCargo: true` y `montoAceptado` (el monto que vio, como
// texto decimal); si el monto ya no coincide con el recalculado → 409 PENALIDAD_CAMBIO con el monto nuevo.
//
// Ventana conocida y aceptada: entre comprobar `montoAceptado` y la cancelación, cancelarReserva recalcula la
// penalidad (milisegundos). Solo cambiaría si justo se cruzara el límite de las 48 h; el huésped acepta el monto que vio.
const prisma = require("../../lib/prisma");
const { conEsperaMaxima } = require("../../lib/correo");
const reservasServicio = require("../reservas/reservas.servicio");
const { ErrorWeb, CODIGO } = require("./ecommerce.errores");
const emailWeb = require("./emailWeb.servicio");
const { armarRespuestaMiReserva, formatoPesos } = require("./miReserva");
const { buscarReserva, evaluar, conPiso } = require("./miReserva.servicio");

const MOTIVO_CANCELACION_WEB = "Cancelada por el huésped desde la web";
const TEXTO_PENDIENTE = "No pudimos cobrar el cargo. Recepción se va a comunicar con vos.";
const PATRON_MONTO = /^\d+(\.\d{1,2})?$/;

const centavos = (valor) => Math.round(Number(valor) * 100);

// Lo que se le informa al huésped tras cancelar: { estado: SIN_CARGO | COBRADO | RETENIDO | PENDIENTE, monto, tarjeta?, texto }.
function resultadoDelCargo(penalidad, garantia) {
  const tarjeta = garantia?.ultimos4 ? { marca: garantia.marca ?? null, ultimos4: garantia.ultimos4 } : null;
  switch (penalidad?.estadoCobro) {
    case "COBRADO": {
      const monto = Number(penalidad.cobradoATarjeta);
      const marca = tarjeta?.marca ? `${tarjeta.marca[0].toUpperCase()}${tarjeta.marca.slice(1).toLowerCase()} ` : "";
      const texto = tarjeta
        ? `Se cobró ${formatoPesos(monto)} con tu tarjeta ${marca}terminada en ${tarjeta.ultimos4} (cargo por cancelación).`
        : `Se cobró ${formatoPesos(monto)} (cargo por cancelación).`;
      return { estado: "COBRADO", monto, tarjeta, texto };
    }
    case "RETENIDO": {
      const monto = Number(penalidad.retenido);
      return { estado: "RETENIDO", monto, tarjeta: null, texto: `No se reintegra el importe pagado (${formatoPesos(monto)}).` };
    }
    case "RECHAZADO":
    case "PENDIENTE":
      return { estado: "PENDIENTE", monto: Number(penalidad.pendienteDeCobro), tarjeta, texto: TEXTO_PENDIENTE };
    default:
      return { estado: "SIN_CARGO", monto: 0, tarjeta: null, texto: "No se realizó ningún cargo." };
  }
}

// POST /api/web/mi-reserva/cancelar — body { codigo, email, aceptaCargo, montoAceptado }.
function cancelarMiReserva(cuerpo) {
  return conPiso(async () => {
    const { reserva, emailReserva } = await buscarReserva(cuerpo);
    // Idempotente: una reserva ya cancelada responde lo mismo, sin otro email.
    if (reserva.estado === "Cancelada") return { estado: "Cancelada", penalidadCobrada: 0 };

    // Todo se recalcula en el servidor (pudo pasar el plazo o cambiar el cargo entre la consulta y el clic).
    const cancelacion = await evaluar(reserva);
    if (!cancelacion.puedeCancelarOnline) {
      throw new ErrorWeb(409, CODIGO.PENALIDAD_CAMBIO, cancelacion.motivo ?? undefined, {
        montoNuevo: cancelacion.penalidad?.monto ?? 0,
        motivo: cancelacion.motivo,
      });
    }

    const cargo = cancelacion.cargo;
    // El monto que el huésped vio tiene que ser el que hoy corresponde (0 si no hay cargo). Si no coincide → 409 con el
    // monto nuevo (y el cargo vigente, para que la pantalla lo muestre y pida aceptarlo de nuevo).
    const montoVigente = cargo ? cargo.monto : 0;
    const mandoMonto = cuerpo?.montoAceptado !== undefined && cuerpo?.montoAceptado !== null && cuerpo?.montoAceptado !== "";
    const montoAceptado = mandoMonto ? String(cuerpo.montoAceptado).trim() : null;
    if (montoAceptado !== null && !PATRON_MONTO.test(montoAceptado)) {
      throw new ErrorWeb(422, CODIGO.DATOS_INVALIDOS, "El monto del cargo no es válido.", { campo: "montoAceptado" });
    }
    if (montoAceptado !== null && centavos(montoAceptado) !== centavos(montoVigente)) {
      throw new ErrorWeb(409, CODIGO.PENALIDAD_CAMBIO, undefined, { montoNuevo: montoVigente, motivo: null, cargo });
    }
    if (cargo && cuerpo?.aceptaCargo !== true) {
      throw new ErrorWeb(422, CODIGO.DATOS_INVALIDOS, "Para cancelar tenés que aceptar el cargo.", { campo: "aceptaCargo" });
    }
    if (cargo && montoAceptado === null) {
      throw new ErrorWeb(422, CODIGO.DATOS_INVALIDOS, "Falta el monto del cargo que aceptás.", { campo: "montoAceptado" });
    }

    let cancelada;
    try {
      cancelada = await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: MOTIVO_CANCELACION_WEB });
    } catch (err) {
      // Otra cancelación ganó la carrera: misma respuesta idempotente.
      const actual = await prisma.reserva.findUnique({ where: { id: reserva.id }, select: { estado: true } });
      if (actual?.estado === "Cancelada") return { estado: "Cancelada", penalidadCobrada: 0 };
      throw err;
    }

    const resultado = resultadoDelCargo(cancelada?.penalidad, reserva.garantiaReserva);
    const datos = armarRespuestaMiReserva({ ...reserva, estado: "Cancelada" }, null);
    // El email no está en el camino crítico: se espera como máximo 1,5 s y, si no llegó, sigue en segundo plano.
    const email = await conEsperaMaxima(emailWeb.enviarCancelacion(datos, emailReserva, resultado), {
      etiqueta: `cancelación ${reserva.codigoConfirmacion}`,
    });
    return {
      estado: "Cancelada",
      penalidadCobrada: resultado.estado === "COBRADO" ? resultado.monto : 0,
      cargo: resultado,
      email,
    };
  });
}

module.exports = { cancelarMiReserva, MOTIVO_CANCELACION_WEB, resultadoDelCargo, TEXTO_PENDIENTE };
