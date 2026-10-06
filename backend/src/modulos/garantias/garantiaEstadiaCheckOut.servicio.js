// Garantía del check-in: qué pasa con ella en el CHECK-OUT.
//
//  - aplicarGarantiaAlSaldo: el recepcionista usa la garantía para cubrir el
//    saldo (preautorización → se CAPTURA hasta el saldo; depósito → se APLICA).
//  - cerrarGarantiaDeEstadia: al confirmar el check-out, lo que no se usó se
//    LIBERA (preautorización) o se DEVUELVE (depósito en efectivo).
//  - registrarDevolucionSaldoAFavor: si lo pagado supera lo adeudado (ej. un
//    descuento del gerente sobre una tarifa no reembolsable ya pagada), el
//    excedente se devuelve. Nunca un saldo negativo sin explicación.
//
// Convención de la devolución (igual que en la cancelación): PagoEstadia con
// concepto "Devolución" e importe NEGATIVO, porque consolidarCargos suma todos
// los medios sin mirar el concepto.
//
// El DEPÓSITO en efectivo nunca fue un pago: no se registró cuando se recibió y
// por eso su devolución tampoco genera un asiento negativo (solo se marca el
// estado). Lo único que entra a la cuenta es lo que se APLICA al saldo.
//
// La pasarela se llama SIEMPRE fuera de las transacciones.

const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const { procesarTarjeta } = require("./pasarela.servicio");
const { ErrorDeNegocio } = require("./garantias.servicio");
const {
  TIPO_GARANTIA_ESTADIA,
  ESTADO_GARANTIA_ESTADIA,
  OPERACION_TARJETA,
  CONCEPTO_DEVOLUCION,
} = require("./garantias.constantes");

const CONCEPTO_PAGO_FINAL = "Pago final";
const centavos = (n) => Math.round(Number(n) * 100);
const pesos = (c) => c / 100;
const FORMATO = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

async function saldoDeLaCuenta(reservaId) {
  // Lazy: check-out importa reservas, y reservas importa este módulo.
  const { consolidarCargos } = require("../check-out/checkOut.servicio");
  return consolidarCargos(reservaId);
}

// Usa la garantía para cubrir saldo. Devuelve lo que se aplicó.
async function aplicarGarantiaAlSaldo(reservaId) {
  const garantia = await prisma.garantiaEstadia.findUnique({ where: { reservaId } });
  if (!garantia) throw new ErrorDeNegocio("La reserva no tiene una garantía del check-in.", 404);
  if (garantia.estado !== ESTADO_GARANTIA_ESTADIA.PENDIENTE || centavos(garantia.montoUsado) > 0) {
    throw new ErrorDeNegocio(`La garantía ya fue ${garantia.estado.toLowerCase()}: no se puede usar de nuevo.`, 409);
  }

  const cuenta = await saldoDeLaCuenta(reservaId);
  if (cuenta.estadoReserva !== "En curso") {
    throw new ErrorDeNegocio(`La reserva está "${cuenta.estadoReserva}": solo se usa la garantía con la estadía en curso.`, 409);
  }
  const aplicable = Math.min(centavos(cuenta.saldo), centavos(garantia.monto));
  if (aplicable <= 0) throw new ErrorDeNegocio("La cuenta no tiene saldo para cubrir con la garantía.", 409);
  const monto = pesos(aplicable);

  const esTarjeta = garantia.tipo === TIPO_GARANTIA_ESTADIA.PREAUTORIZACION;
  let referencia = "Depósito en garantía aplicado";
  let medioPago = "Efectivo";
  let estadoFinal = ESTADO_GARANTIA_ESTADIA.APLICADA;

  if (esTarjeta) {
    // Captura PARCIAL (hasta el saldo): lo que sobra de la retención se libera solo.
    let captura;
    try {
      captura = await procesarTarjeta({
        operacion: OPERACION_TARJETA.CAPTURA,
        monto,
        referenciaPrevia: garantia.referencia,
        claveIdempotencia: `captura-estadia:${reservaId}`,
      });
    } catch (err) {
      captura = { aprobado: false, motivoRechazo: err.message };
    }
    if (!captura.aprobado) {
      throw new ErrorDeNegocio(`No se pudo cobrar a la tarjeta en garantía: ${captura.motivoRechazo}`, 502);
    }
    referencia = `${garantia.marca} ****${garantia.ultimos4} · aut. ${captura.referencia}`.slice(0, 191);
    medioPago = "Tarjeta crédito";
    estadoFinal = ESTADO_GARANTIA_ESTADIA.CAPTURADA;
  }

  // Guarda de estado: dos clics seguidos no registran dos veces el pago (la
  // clave de idempotencia de arriba tampoco captura dos veces).
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.garantiaEstadia.updateMany({
      where: { reservaId, estado: ESTADO_GARANTIA_ESTADIA.PENDIENTE, montoUsado: 0 },
      data: { estado: estadoFinal, montoUsado: monto },
    });
    if (count !== 1) throw new ErrorDeNegocio("La garantía ya fue usada. Actualizá la pantalla.", 409);
    await tx.pagoEstadia.create({
      data: {
        reservaId,
        estado: "Pagado",
        concepto: CONCEPTO_PAGO_FINAL,
        medios: { create: [{ medioPago, importe: monto, referencia }] },
      },
    });
  }, OPCIONES_TRANSACCION);

  return { aplicado: monto, medioPago, tipo: garantia.tipo, estado: estadoFinal };
}

// Al confirmar el check-out: lo que no se usó se libera o se devuelve. Es un
// paso POSTERIOR al cierre y no lo bloquea: si falla, el check-out ya está
// hecho y la garantía queda "Pendiente" (visible) para resolverla a mano.
async function cerrarGarantiaDeEstadia(reservaId) {
  try {
    const garantia = await prisma.garantiaEstadia.findUnique({ where: { reservaId } });
    if (!garantia) return null;
    const usado = centavos(garantia.montoUsado);
    const restante = centavos(garantia.monto) - usado;

    if (garantia.tipo === TIPO_GARANTIA_ESTADIA.PREAUTORIZACION) {
      if (garantia.estado !== ESTADO_GARANTIA_ESTADIA.PENDIENTE) {
        // Ya se capturó (total o parcial): lo que sobró de la retención se libera solo.
        return { tipo: garantia.tipo, estado: garantia.estado, mensaje: `Se cobraron ${FORMATO.format(pesos(usado))} de la garantía.` };
      }
      const lib = await procesarTarjeta({
        operacion: OPERACION_TARJETA.LIBERACION,
        monto: pesos(restante),
        referenciaPrevia: garantia.referencia,
        claveIdempotencia: `liberar-estadia:${reservaId}`,
      });
      if (!lib.aprobado) throw new Error(lib.motivoRechazo ?? "la pasarela no liberó la retención");
      await prisma.garantiaEstadia.update({ where: { reservaId }, data: { estado: ESTADO_GARANTIA_ESTADIA.LIBERADA } });
      return { tipo: garantia.tipo, estado: ESTADO_GARANTIA_ESTADIA.LIBERADA, mensaje: `Se liberó la preautorización de ${FORMATO.format(pesos(restante))}: no se cobró nada.` };
    }

    // Depósito en efectivo
    if (garantia.estado === ESTADO_GARANTIA_ESTADIA.DEVUELTA) return null;
    const estadoFinal = usado > 0 ? ESTADO_GARANTIA_ESTADIA.APLICADA : ESTADO_GARANTIA_ESTADIA.DEVUELTA;
    if (restante > 0 || usado === 0) {
      await prisma.garantiaEstadia.update({ where: { reservaId }, data: { estado: estadoFinal } });
    }
    return {
      tipo: garantia.tipo,
      estado: estadoFinal,
      devolver: pesos(restante),
      mensaje:
        restante > 0
          ? `Devolver ${FORMATO.format(pesos(restante))} del depósito en efectivo al huésped.`
          : `El depósito se usó completo (${FORMATO.format(pesos(usado))}).`,
    };
  } catch (err) {
    console.error("[garantias] No se pudo cerrar la garantía de la estadía:", err.message);
    return { estado: ESTADO_GARANTIA_ESTADIA.PENDIENTE, mensaje: "La garantía quedó pendiente de cerrar: revisala a mano." };
  }
}

// Dentro de la transacción del check-out: devuelve lo que sobra pagado.
// `medioPago` es el del primer pago real (se devuelve por el mismo medio).
async function registrarDevolucionSaldoAFavor(tx, { reservaId, monto, medioPago }) {
  const importe = pesos(centavos(monto));
  if (!(importe > 0)) return null;
  return tx.pagoEstadia.create({
    data: {
      reservaId,
      estado: "Pagado",
      concepto: CONCEPTO_DEVOLUCION,
      medios: {
        create: [{ medioPago: medioPago ?? "Efectivo", importe: -importe, referencia: "Saldo a favor del huésped — a devolver" }],
      },
    },
  });
}

module.exports = { aplicarGarantiaAlSaldo, cerrarGarantiaDeEstadia, registrarDevolucionSaldoAFavor, ErrorDeNegocio };
