// Cancelación y no-show con cobro de la penalidad.
//
// Reglas (docs/garantia-tarjeta.md, sección "Cancelación y no-show"):
//  - El MONTO sale siempre de calcularPenalidad (tarifas): acá nunca se
//    calcula un precio ni se interpreta el plan. Solo se decide cómo se cobra.
//  - Primero se descuenta lo que el huésped ya pagó (prepago, NRF capturado):
//    la penalidad se retiene de ahí y se devuelve el resto. NRF ya pagado:
//    se retiene todo, no se cobra nada más y no se devuelve nada.
//  - Lo que falte se cobra a la tarjeta de la garantía (por token, sin el
//    número). Sin tarjeta, o si la tarjeta rechaza, queda PENDIENTE: el
//    huésped igual tiene derecho a cancelar y la reserva se cancela igual.
//  - La pasarela se llama FUERA de las transacciones. Orden:
//      1) tx corta: cancelar (con guarda de estado) + devolución + garantía
//         en "Cobro pendiente";   2) cobro en la pasarela;
//      3) tx corta: registrar el cobro y la garantía "Capturada".
//    Así una caída entre pasos deja la reserva cancelada y la deuda visible
//    ("Cobro pendiente"), nunca un cobro sin registro.
//  - Sin escrituras en loops dentro de transacciones (doc de timeouts).

const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const { calcularPenalidad, ErrorDeNegocio: ErrorPenalidad } = require("../tarifas/penalidades.servicio");
const { procesarTarjeta } = require("./pasarela.servicio");
const {
  TIPO_GARANTIA,
  ESTADO_GARANTIA,
  OPERACION_TARJETA,
  CONCEPTO_PENALIDAD_CANCELACION,
  CONCEPTO_PENALIDAD_NO_SHOW,
  CONCEPTO_DEVOLUCION,
} = require("./garantias.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

const centavos = (n) => Math.round(Number(n) * 100);
const pesos = (c) => c / 100;
const FORMATO = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

// Pura (sin base ni pasarela): reparte la penalidad entre lo ya pagado y la
// tarjeta. Todo en centavos enteros para no arrastrar errores de coma flotante.
function liquidarPenalidad({ penalidad, pagado, tieneTarjeta }) {
  const aplicaP = penalidad.aplica ? centavos(penalidad.monto) : 0;
  const pagadoC = Math.max(0, centavos(pagado));
  const retenido = Math.min(pagadoC, aplicaP);
  const devolver = pagadoC - retenido;
  const resto = aplicaP - retenido;
  return {
    penalidad: pesos(aplicaP),
    retenido: pesos(retenido),
    devolver: pesos(devolver),
    aCobrarATarjeta: tieneTarjeta ? pesos(resto) : 0,
    sinCobrar: tieneTarjeta ? 0 : pesos(resto),
  };
}

function textoDeResultado({ liq, estadoCobro, cobro, garantia }) {
  const tarjeta = garantia?.ultimos4 ? `${garantia.marca ?? "Tarjeta"} ****${garantia.ultimos4}` : "la tarjeta";
  const partes = [];
  if (liq.penalidad === 0) {
    partes.push("Sin cargo.");
  } else if (liq.retenido > 0) {
    partes.push(`Se retuvieron ${FORMATO.format(liq.retenido)} de lo ya pagado.`);
  }
  if (liq.devolver > 0) partes.push(`Se devuelven ${FORMATO.format(liq.devolver)} al huésped.`);
  if (estadoCobro === "COBRADO") partes.push(`Se cobraron ${FORMATO.format(liq.aCobrarATarjeta)} a ${tarjeta}.`);
  if (estadoCobro === "RECHAZADO") {
    partes.push(`La tarjeta rechazó el cobro de ${FORMATO.format(liq.aCobrarATarjeta)} (${cobro?.motivoRechazo ?? "sin detalle"}): queda pendiente.`);
  }
  if (estadoCobro === "PENDIENTE") {
    partes.push(`Quedan ${FORMATO.format(liq.sinCobrar)} pendientes de cobro: no hay tarjeta en garantía.`);
  }
  return partes.join(" ");
}

function traducirError(err) {
  if (err instanceof ErrorPenalidad) return new ErrorDeNegocio(err.message, err.statusCode);
  return err;
}

// Lecturas + reparto del dinero, SIN escribir nada. Lo usan tanto el cierre
// real como la vista previa de la pantalla (así el aviso de "qué va a pasar"
// nunca puede desincronizarse de lo que realmente pasa).
async function calcularLiquidacion({ reservaId, tipo }) {
  let penalidad;
  try {
    penalidad = await calcularPenalidad({ reservaId, tipo });
  } catch (err) {
    throw traducirError(err);
  }

  // Lecturas fuera de la transacción (la base está en París, ~387 ms por consulta).
  const pagos = await prisma.pagoEstadia.findMany({ where: { reservaId, anulado: false }, include: { medios: true } });
  const garantia = await prisma.garantiaReserva.findUnique({ where: { reservaId } });

  const pagosReales = pagos.filter((p) => p.concepto !== CONCEPTO_DEVOLUCION);
  const pagado = pagosReales.reduce((acc, p) => acc + p.medios.reduce((a, m) => a + Number(m.importe), 0), 0);
  const medioOriginal = pagosReales[0]?.medios?.[0]?.medioPago ?? "Efectivo";
  const tieneTarjeta = garantia?.tipo === TIPO_GARANTIA.TARJETA && Boolean(garantia.token);
  const liq = liquidarPenalidad({ penalidad, pagado, tieneTarjeta });
  return { penalidad, garantia, medioOriginal, liq };
}

// Vista previa para la pantalla: qué se va a retener, devolver y cobrar si se
// confirma ahora. No escribe nada ni llama a la pasarela.
async function previsualizarCierre({ reservaId, tipo }) {
  const { penalidad, garantia, liq } = await calcularLiquidacion({ reservaId, tipo });
  const estadoCobro =
    liq.penalidad === 0 ? "SIN_CARGO"
    : liq.aCobrarATarjeta === 0 && liq.sinCobrar === 0 ? "RETENIDO"
    : liq.sinCobrar > 0 ? "PENDIENTE"
    : "COBRADO";
  return {
    tipo,
    regla: penalidad.regla,
    monto: liq.penalidad,
    retenido: liq.retenido,
    devuelto: liq.devolver,
    aCobrarATarjeta: liq.aCobrarATarjeta,
    sinCobrar: liq.sinCobrar,
    tarjeta: garantia?.tipo === TIPO_GARANTIA.TARJETA ? { marca: garantia.marca, ultimos4: garantia.ultimos4 } : null,
    estadoCobro,
  };
}

// tipo: "CANCELACION" | "NO_SHOW". `estadoDestino`: Cancelada | No-show.
// La reserva ya fue validada por quien llama (existe y está Confirmada);
// acá igual se vuelve a exigir en la guarda de la transacción.
async function cerrarReservaConPenalidad({ reservaId, tipo, estadoDestino, motivo }) {
  const { garantia, medioOriginal, liq, penalidad } = await calcularLiquidacion({ reservaId, tipo });

  const hayDeuda = liq.aCobrarATarjeta > 0 || liq.sinCobrar > 0;
  let estadoGarantiaTrasCancelar = garantia?.estado;
  if (garantia) {
    if (hayDeuda) estadoGarantiaTrasCancelar = ESTADO_GARANTIA.COBRO_PENDIENTE;
    else if (garantia.estado === ESTADO_GARANTIA.VIGENTE || garantia.estado === ESTADO_GARANTIA.PREAUTORIZADA) {
      estadoGarantiaTrasCancelar = ESTADO_GARANTIA.LIBERADA;
    }
  }

  // 1) Cancelar de verdad (con guarda) + devolución + estado de la garantía.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.reserva.updateMany({
      where: { id: reservaId, estado: ESTADO_RESERVA.CONFIRMADA },
      data: { estado: estadoDestino, motivoCancelacion: motivo },
    });
    if (count !== 1) {
      throw new ErrorDeNegocio("La reserva cambió de estado mientras se procesaba. Actualizá la pantalla y revisá.", 409);
    }
    if (liq.devolver > 0) {
      await tx.pagoEstadia.create({
        data: {
          reservaId,
          estado: "Pagado",
          concepto: CONCEPTO_DEVOLUCION,
          medios: {
            create: [
              {
                medioPago: medioOriginal,
                // NEGATIVO a propósito: consolidarCargos suma todos los medios
                // de pagos no anulados sin mirar el concepto, así que una
                // devolución positiva AUMENTARÍA lo pagado. Con signo negativo
                // el "total pagado" de la reserva cancelada es exactamente lo
                // que el hotel se quedó (pagado − devuelto), sin tocar el
                // cálculo del check-out.
                importe: -liq.devolver,
                referencia: `Devolución por ${tipo === "NO_SHOW" ? "no-show" : "cancelación"} — a acreditar`,
              },
            ],
          },
        },
      });
    }
    if (garantia && estadoGarantiaTrasCancelar !== garantia.estado) {
      await tx.garantiaReserva.update({ where: { reservaId }, data: { estado: estadoGarantiaTrasCancelar } });
    }
  }, OPCIONES_TRANSACCION);

  // 2) y 3) Cobro del resto a la tarjeta, ya fuera de la transacción.
  let estadoCobro = "SIN_CARGO";
  let cobro = null;
  if (liq.penalidad === 0) {
    estadoCobro = "SIN_CARGO";
  } else if (liq.aCobrarATarjeta === 0 && liq.sinCobrar === 0) {
    estadoCobro = "RETENIDO"; // la penalidad quedó cubierta con lo ya pagado
  } else if (liq.sinCobrar > 0) {
    estadoCobro = "PENDIENTE";
  } else {
    try {
      cobro = await procesarTarjeta({
        operacion: OPERACION_TARJETA.COBRO,
        monto: liq.aCobrarATarjeta,
        referenciaPrevia: garantia.token,
        claveIdempotencia: `penalidad:${reservaId}:${tipo}`,
      });
    } catch (err) {
      cobro = { aprobado: false, motivoRechazo: err.message };
    }

    if (cobro.aprobado) {
      estadoCobro = "COBRADO";
      await prisma.$transaction(async (tx) => {
        await tx.pagoEstadia.create({
          data: {
            reservaId,
            estado: "Pagado",
            concepto: tipo === "NO_SHOW" ? CONCEPTO_PENALIDAD_NO_SHOW : CONCEPTO_PENALIDAD_CANCELACION,
            medios: {
              create: [
                {
                  medioPago: "Tarjeta crédito",
                  importe: liq.aCobrarATarjeta,
                  referencia: `${garantia.marca} ****${garantia.ultimos4} · aut. ${cobro.referencia}`.slice(0, 191),
                },
              ],
            },
          },
        });
        await tx.garantiaReserva.update({ where: { reservaId }, data: { estado: ESTADO_GARANTIA.CAPTURADA } });
      }, OPCIONES_TRANSACCION);
    } else {
      estadoCobro = "RECHAZADO";
      await prisma.garantiaReserva.update({ where: { reservaId }, data: { estado: ESTADO_GARANTIA.COBRO_RECHAZADO } });
    }
  }

  return {
    tipo,
    regla: penalidad.regla,
    monto: liq.penalidad,
    retenido: liq.retenido,
    devuelto: liq.devolver,
    cobradoATarjeta: estadoCobro === "COBRADO" ? liq.aCobrarATarjeta : 0,
    pendienteDeCobro: estadoCobro === "RECHAZADO" ? liq.aCobrarATarjeta : liq.sinCobrar,
    estadoCobro,
    mensaje: textoDeResultado({ liq, estadoCobro, cobro, garantia }),
  };
}

module.exports = { cerrarReservaConPenalidad, previsualizarCierre, liquidarPenalidad, ErrorDeNegocio };
