// Garantía de la reserva (tarjeta de crédito / prepago).
//
// Qué hace este módulo y qué NO:
//  - Registra el respaldo de una reserva y orquesta la pasarela simulada.
//  - NUNCA calcula precios: el total sale siempre de la cotización que
//    valida crearReservaEnTransaccion (ReservaNoche) y las penalidades de
//    calcularPenalidad (tarifas). Acá solo se cobra lo que esos módulos dicen.
//  - NUNCA guarda el número de tarjeta ni el CVV: de la tarjeta solo queda
//    el token, la marca, los últimos 4 y el vencimiento.
//
// Orden de una reserva con cobro (acordado con el equipo): la pasarela se
// llama SIEMPRE fuera de la transacción de base de datos.
//   NRF:  preautorizar → crear la reserva (tx) → capturar si salió bien,
//         liberar si falló.
//   BAR:  tokenizar la tarjeta (sin cobro) → crear la reserva (tx).

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const { procesarTarjeta, luhnValido, normalizarVencimiento, ultimoDiaDelMes } = require("./pasarela.servicio");
const {
  TIPO_GARANTIA,
  TIPOS_GARANTIA,
  ESTADO_GARANTIA,
  ESTADOS_GARANTIA,
  OPERACION_TARJETA,
  MEDIOS_PREPAGO,
  CONCEPTO_PAGO_ANTICIPADO,
} = require("./garantias.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Comparar en centavos (enteros), mismo criterio que pagoEstadia.servicio.js.
function centavos(n) {
  return Math.round(Number(n) * 100);
}

function soloDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

function formatearVencimiento({ mes, anio }) {
  return `${String(mes).padStart(2, "0")}/${String(anio % 100).padStart(2, "0")}`;
}

// Texto para auditar el cobro, mismo formato que ya usa la terminal simulada
// del mostrador: "Visa ****4242 · aut. PRE-483920".
function referenciaDeCobro({ marca, ultimos4, referencia }) {
  return `${marca} ****${ultimos4} · aut. ${referencia}`.slice(0, 191);
}

// --------------------------------------------------------------
// Validación (pura, sin base ni pasarela)
// --------------------------------------------------------------

// Valida el bloque `garantia` que manda el cliente contra el plan y el total.
// Devuelve lo que necesita el resto del flujo; tira ErrorDeNegocio 400 si algo
// no cierra. El número y el CVV se validan acá (Luhn, vencimiento) pero solo
// se reenvían a la pasarela: nunca se guardan.
function validarGarantiaDeReserva({ garantia, plan, totalEsperado, fechaHasta }) {
  const tipo = garantia?.tipo;
  if (!TIPOS_GARANTIA.includes(tipo)) {
    throw new ErrorDeNegocio(`garantia.tipo debe ser uno de: ${TIPOS_GARANTIA.join(", ")}.`);
  }
  if (tipo === TIPO_GARANTIA.NO_GARANTIZADA) {
    throw new ErrorDeNegocio("La reserva no garantizada todavía no está disponible.");
  }
  const reembolsable = plan?.reembolsable === true;

  if (tipo === TIPO_GARANTIA.TARJETA) {
    const tarjeta = garantia.tarjeta;
    if (!tarjeta || typeof tarjeta !== "object") throw new ErrorDeNegocio("Falta la tarjeta de la garantía.");
    if (!luhnValido(soloDigitos(tarjeta.numero))) throw new ErrorDeNegocio("Número de tarjeta inválido.");
    if (!String(tarjeta.titular ?? "").trim()) throw new ErrorDeNegocio("Falta el titular de la tarjeta.");
    if (!/^\d{3,4}$/.test(String(tarjeta.cvv ?? ""))) throw new ErrorDeNegocio("Código de seguridad inválido.");
    const venc = normalizarVencimiento(tarjeta.vencimientoMes, tarjeta.vencimientoAnio);
    if (!venc) throw new ErrorDeNegocio("Vencimiento de la tarjeta inválido (MM/AA).");
    // Una tarjeta vence el último día de su mes: tiene que cubrir hasta la
    // salida, así sigue sirviendo para cobrar consumos y penalidades.
    if (ultimoDiaDelMes(venc) < fechaHasta) {
      throw new ErrorDeNegocio("La tarjeta vence antes de la fecha de salida de la reserva.");
    }
    return { tipo, tarjeta, venc, cobraTotal: !reembolsable };
  }

  // PREPAGO
  const medios = garantia.medios;
  if (!Array.isArray(medios) || medios.length === 0) {
    throw new ErrorDeNegocio("Un prepago necesita al menos un medio de pago en garantia.medios.");
  }
  let total = 0;
  for (const m of medios) {
    if (!MEDIOS_PREPAGO.includes(m?.tipo)) {
      throw new ErrorDeNegocio(`Medio de prepago inválido. Valores permitidos: ${MEDIOS_PREPAGO.join(", ")}.`);
    }
    if (!(Number(m.importe) > 0)) throw new ErrorDeNegocio("Cada medio de pago necesita un importe mayor a cero.");
    if (m.tipo === "Tarjeta débito" && !String(m.referencia ?? "").trim()) {
      throw new ErrorDeNegocio("El pago con Tarjeta débito necesita la autorización de la tarjeta (referencia).");
    }
    total += Number(m.importe);
  }
  if (!reembolsable && centavos(total) !== centavos(totalEsperado)) {
    throw new ErrorDeNegocio(
      "Una tarifa no reembolsable sin tarjeta solo se puede reservar con prepago por el total de la estadía."
    );
  }
  if (centavos(total) > centavos(totalEsperado)) {
    throw new ErrorDeNegocio("El prepago no puede superar el total de la estadía.");
  }
  return { tipo, medios, monto: total, cobraTotal: false };
}

// --------------------------------------------------------------
// Antes de la transacción: la pasarela (nunca dentro de la tx)
// --------------------------------------------------------------

// Devuelve lo ya autorizado, listo para registrarse dentro de la transacción
// de la reserva. Si la pasarela rechaza, tira 402 y NO se crea nada.
async function autorizarGarantia({ validada, totalEsperado, claveIdempotencia }) {
  if (validada.tipo === TIPO_GARANTIA.PREPAGO) {
    return { tipo: TIPO_GARANTIA.PREPAGO, medios: validada.medios, monto: validada.monto, preautorizacion: null };
  }

  const { tarjeta, venc, cobraTotal } = validada;
  const resultado = await procesarTarjeta({
    operacion: cobraTotal ? OPERACION_TARJETA.PREAUTORIZACION : OPERACION_TARJETA.GARANTIA,
    monto: cobraTotal ? totalEsperado : 0,
    tarjeta,
    claveIdempotencia,
  });
  if (!resultado.aprobado) {
    throw new ErrorDeNegocio(`La tarjeta fue rechazada: ${resultado.motivoRechazo}`, 402);
  }

  // GARANTIA (BAR) devuelve el token en `token`; PREAUTORIZACION con tarjeta
  // nueva también. La referencia de la preautorización es la que después se
  // captura o se libera.
  return {
    tipo: TIPO_GARANTIA.TARJETA,
    token: resultado.token,
    marca: resultado.marca,
    ultimos4: resultado.ultimos4,
    vencimiento: formatearVencimiento(venc),
    referencia: resultado.referencia,
    monto: cobraTotal ? totalEsperado : 0,
    estado: cobraTotal ? ESTADO_GARANTIA.PREAUTORIZADA : ESTADO_GARANTIA.VIGENTE,
    preautorizacion: cobraTotal ? { referencia: resultado.referencia, monto: totalEsperado } : null,
  };
}

// --------------------------------------------------------------
// Dentro de la transacción de la reserva
// --------------------------------------------------------------

// Función pública pedida por el e-commerce: registra la garantía de una
// reserva ya creada, dentro de la transacción de quien llama.
//   registrarGarantiaEnTransaccion(tx, { reservaId, tipo, token, marca,
//     ultimos4, vencimiento, referencia, monto, estado })
// `vencimiento` es "MM/AA".
async function registrarGarantiaEnTransaccion(
  tx,
  { reservaId, tipo, token = null, marca = null, ultimos4 = null, vencimiento = null, referencia = null, monto = 0, estado }
) {
  if (!Number.isInteger(Number(reservaId)) || Number(reservaId) <= 0) {
    throw new ErrorDeNegocio("reservaId es obligatorio.");
  }
  if (!TIPOS_GARANTIA.includes(tipo)) {
    throw new ErrorDeNegocio(`tipo debe ser uno de: ${TIPOS_GARANTIA.join(", ")}.`);
  }
  if (!ESTADOS_GARANTIA.includes(estado)) {
    throw new ErrorDeNegocio(`estado debe ser uno de: ${ESTADOS_GARANTIA.join(", ")}.`);
  }
  if (tipo === TIPO_GARANTIA.TARJETA) {
    if (!token) throw new ErrorDeNegocio("Una garantía con tarjeta necesita el token de la pasarela.");
    if (!/^\d{4}$/.test(String(ultimos4 ?? ""))) throw new ErrorDeNegocio("ultimos4 debe tener 4 dígitos.");
    if (!marca) throw new ErrorDeNegocio("Falta la marca de la tarjeta.");
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(String(vencimiento ?? ""))) {
      throw new ErrorDeNegocio("vencimiento debe tener el formato MM/AA.");
    }
  }
  const importe = new Prisma.Decimal(monto ?? 0);
  if (importe.isNegative()) throw new ErrorDeNegocio("monto no puede ser negativo.");

  return tx.garantiaReserva.create({
    data: {
      reservaId: Number(reservaId),
      tipo,
      token,
      marca,
      ultimos4,
      vencimiento,
      referencia,
      monto: importe,
      estado,
    },
  });
}

// Registra la garantía ya autorizada y, si fue un prepago, el pago que la
// respalda (crearPagoEnTransaccion no se usa acá: importa check-out, que
// importa reservas, y formaría un ciclo — y el total ya lo validó
// crearReservaEnTransaccion contra la cotización).
async function registrarEnTransaccion(tx, { reservaId, autorizada, totalEsperado }) {
  if (autorizada.tipo === TIPO_GARANTIA.PREPAGO) {
    const garantia = await registrarGarantiaEnTransaccion(tx, {
      reservaId,
      tipo: TIPO_GARANTIA.PREPAGO,
      monto: autorizada.monto,
      estado: ESTADO_GARANTIA.CAPTURADA,
    });
    await tx.pagoEstadia.create({
      data: {
        reservaId,
        estado: centavos(autorizada.monto) >= centavos(totalEsperado) ? "Pagado" : "Parcial",
        concepto: CONCEPTO_PAGO_ANTICIPADO,
        medios: {
          create: autorizada.medios.map((m) => ({
            medioPago: m.tipo,
            importe: Number(m.importe),
            ...(String(m.referencia ?? "").trim() ? { referencia: String(m.referencia).trim() } : {}),
          })),
        },
      },
    });
    return garantia;
  }

  return registrarGarantiaEnTransaccion(tx, { reservaId, ...autorizada });
}

// --------------------------------------------------------------
// Después de la transacción
// --------------------------------------------------------------

// Si la reserva no se pudo crear después de preautorizar, se suelta la
// retención. Mejor esfuerzo: un fallo acá no tapa el error original.
async function liberarPreautorizacion(autorizada, claveIdempotencia) {
  if (!autorizada?.preautorizacion) return;
  try {
    await procesarTarjeta({
      operacion: OPERACION_TARJETA.LIBERACION,
      monto: autorizada.preautorizacion.monto,
      referenciaPrevia: autorizada.preautorizacion.referencia,
      claveIdempotencia: `${claveIdempotencia}:lib`,
    });
  } catch (err) {
    console.error("[garantias] No se pudo liberar la preautorización:", err.message);
  }
}

// NRF con tarjeta: ya está la reserva, se captura lo preautorizado y recién
// ahí se registra el pago. Si la captura falla, la reserva NO queda como
// pagada: se cancela con motivo y se libera la retención (invariante: toda
// reserva NRF existente está paga).
async function capturarCobroDeReserva({ reservaId, autorizada, claveIdempotencia }) {
  if (!autorizada.preautorizacion) return;
  const { referencia, monto } = autorizada.preautorizacion;

  let captura;
  try {
    captura = await procesarTarjeta({
      operacion: OPERACION_TARJETA.CAPTURA,
      monto,
      referenciaPrevia: referencia,
      claveIdempotencia: `${claveIdempotencia}:cap`,
    });
  } catch (err) {
    captura = { aprobado: false, motivoRechazo: err.message };
  }

  if (!captura.aprobado) {
    await liberarPreautorizacion(autorizada, claveIdempotencia);
    await prisma.reserva.update({
      where: { id: reservaId },
      data: {
        estado: ESTADO_RESERVA.CANCELADA,
        motivoCancelacion: "No se pudo capturar el cobro de la tarifa no reembolsable.",
      },
    });
    // La retención ya se soltó: la garantía no puede seguir figurando como "Preautorizada".
    await prisma.garantiaReserva.update({ where: { reservaId }, data: { estado: ESTADO_GARANTIA.LIBERADA } });
    throw new ErrorDeNegocio(
      `No se pudo cobrar la tarifa no reembolsable (${captura.motivoRechazo}). La reserva no quedó confirmada.`,
      502
    );
  }

  // Pago + estado de la garantía en una sola transacción corta (2 escrituras,
  // sin loops ni lecturas pesadas).
  await prisma.$transaction(async (tx) => {
    await tx.garantiaReserva.update({ where: { reservaId }, data: { estado: ESTADO_GARANTIA.CAPTURADA } });
    await tx.pagoEstadia.create({
      data: {
        reservaId,
        estado: "Pagado",
        concepto: CONCEPTO_PAGO_ANTICIPADO,
        medios: {
          create: [
            {
              medioPago: "Tarjeta crédito",
              importe: Number(monto),
              referencia: referenciaDeCobro({
                marca: autorizada.marca,
                ultimos4: autorizada.ultimos4,
                referencia: captura.referencia,
              }),
            },
          ],
        },
      },
    });
  }, OPCIONES_TRANSACCION);
}

// Lo que se devuelve al cliente: sin token ni referencias internas.
function resumenDeGarantia(autorizada, estadoFinal) {
  return {
    tipo: autorizada.tipo,
    estado: estadoFinal,
    marca: autorizada.marca ?? null,
    ultimos4: autorizada.ultimos4 ?? null,
    monto: Number(autorizada.monto ?? 0),
  };
}

module.exports = {
  validarGarantiaDeReserva,
  autorizarGarantia,
  registrarGarantiaEnTransaccion,
  registrarEnTransaccion,
  liberarPreautorizacion,
  capturarCobroDeReserva,
  resumenDeGarantia,
  ErrorDeNegocio,
};
