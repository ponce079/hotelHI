// Garantía del check-in: preautorización con tarjeta de crédito o depósito en
// efectivo. Reemplaza al viejo pago "Garantía" de $30.000, que se registraba
// como un PAGO real y por eso restaba del saldo en el check-out sin que nadie
// lo liberara ni lo devolviera.
//
// Reglas:
//  - NO es un pago: vive en su propia tabla (garantias_estadia) y no cuenta en
//    lo pagado de la reserva.
//  - Con tarjeta: si la reserva ya dejó una tarjeta en garantía se preautoriza
//    POR TOKEN (no se vuelve a pedir la tarjeta); si no la dejó (walk-in, o una
//    reserva con prepago) se piden los datos de una tarjeta de crédito, que
//    viajan una vez a la pasarela y se descartan.
//  - La pasarela se llama ANTES del check-in (si la tarjeta se rechaza, no hay
//    check-in) y NUNCA dentro de una transacción. Si el check-in falla después
//    de preautorizar, se libera la retención.
//  - El monto es fijo (MONTO_PREAUTORIZACION_CHECKIN, ver garantias.constantes).

const prisma = require("../../lib/prisma");
const { procesarTarjeta } = require("./pasarela.servicio");
const { validarGarantiaDeReserva, liberarPreautorizacion, ErrorDeNegocio } = require("./garantias.servicio");
const {
  MONTO_PREAUTORIZACION_CHECKIN,
  TIPO_GARANTIA,
  TIPO_GARANTIA_ESTADIA,
  ESTADO_GARANTIA_ESTADIA,
  OPERACION_TARJETA,
  MEDIO_GARANTIA_TARJETA,
  MEDIO_GARANTIA_EFECTIVO,
  MEDIOS_GARANTIA_CHECKIN,
} = require("./garantias.constantes");

const crypto = require("node:crypto");

// Valida el pedido ANTES de hacer nada. `fechaHasta` (Date) es la salida de la
// estadía: la tarjeta nueva tiene que cubrirla, igual que en la reserva.
function validarEnCheckIn({ garantiaConfirmada, medioGarantia, garantiaTarjeta, fechaHasta }) {
  if (garantiaConfirmada !== true) {
    throw new ErrorDeNegocio("No se puede confirmar el check-in sin validar la garantía del huésped.");
  }
  if (medioGarantia === "Tarjeta débito") {
    throw new ErrorDeNegocio(
      "Con tarjeta de débito no se preautoriza: el dinero sale de la cuenta del huésped. Usá tarjeta de crédito o recibí un depósito en efectivo."
    );
  }
  if (!MEDIOS_GARANTIA_CHECKIN.includes(medioGarantia)) {
    throw new ErrorDeNegocio(`medioGarantia debe ser uno de: ${MEDIOS_GARANTIA_CHECKIN.join(", ")}.`);
  }
  if (medioGarantia === MEDIO_GARANTIA_EFECTIVO) {
    return { tipo: TIPO_GARANTIA_ESTADIA.DEPOSITO_EFECTIVO, tarjeta: null };
  }
  if (garantiaTarjeta == null) {
    // Sin tarjeta nueva: se usará la que dejó la reserva (se verifica al autorizar).
    return { tipo: TIPO_GARANTIA_ESTADIA.PREAUTORIZACION, tarjeta: null };
  }
  // Tarjeta nueva: mismas validaciones que en la reserva (Luhn, titular, CVV,
  // vencimiento posterior a la salida). El plan no importa acá.
  const v = validarGarantiaDeReserva({
    garantia: { tipo: TIPO_GARANTIA.TARJETA, tarjeta: garantiaTarjeta },
    plan: { reembolsable: true },
    totalEsperado: 0,
    fechaHasta,
  });
  return { tipo: TIPO_GARANTIA_ESTADIA.PREAUTORIZACION, tarjeta: v.tarjeta };
}

// Llama a la pasarela (fuera de transacción). Devuelve lo que después se
// registra. Si la tarjeta se rechaza → 402 y NO se hace el check-in.
async function autorizarEnCheckIn({ validada, reservaId, claveIdempotencia }) {
  const monto = MONTO_PREAUTORIZACION_CHECKIN;
  if (validada.tipo === TIPO_GARANTIA_ESTADIA.DEPOSITO_EFECTIVO) {
    return { tipo: validada.tipo, monto, preautorizacion: null };
  }

  let pedido;
  if (validada.tarjeta) {
    pedido = { tarjeta: validada.tarjeta };
  } else {
    const guardada = reservaId ? await prisma.garantiaReserva.findUnique({ where: { reservaId } }) : null;
    if (!guardada || guardada.tipo !== TIPO_GARANTIA.TARJETA || !guardada.token) {
      throw new ErrorDeNegocio(
        "Esta reserva no dejó una tarjeta en garantía: cargá los datos de una tarjeta de crédito o recibí un depósito en efectivo."
      );
    }
    pedido = { referenciaPrevia: guardada.token };
  }

  const r = await procesarTarjeta({ operacion: OPERACION_TARJETA.PREAUTORIZACION, monto, claveIdempotencia, ...pedido });
  if (!r.aprobado) throw new ErrorDeNegocio(`La tarjeta fue rechazada: ${r.motivoRechazo}`, 402);

  return {
    tipo: validada.tipo,
    monto,
    token: r.token,
    referencia: r.referencia,
    marca: r.marca,
    ultimos4: r.ultimos4,
    preautorizacion: { referencia: r.referencia, monto },
  };
}

// Registra la garantía una vez hecho el check-in. Si no se puede guardar, se
// suelta la retención para no dejar plata trabada sin registro.
async function registrarEnCheckIn(reservaId, autorizada, claveIdempotencia) {
  try {
    await prisma.garantiaEstadia.create({
      data: {
        reservaId,
        tipo: autorizada.tipo,
        monto: autorizada.monto,
        token: autorizada.token ?? null,
        referencia: autorizada.referencia ?? null,
        marca: autorizada.marca ?? null,
        ultimos4: autorizada.ultimos4 ?? null,
        estado: ESTADO_GARANTIA_ESTADIA.PENDIENTE,
      },
    });
  } catch (err) {
    await liberarPreautorizacion(autorizada, claveIdempotencia);
    throw err;
  }
}

// Envoltorio para los puntos de check-in: autoriza, ejecuta el check-in y
// registra; libera la retención si el check-in falla.
//   const g = await conGarantiaDeCheckIn({ pedido, reservaId, fechaHasta });
//   try { ...check-in... } catch (e) { await g.liberar(); throw e; }
//   await g.registrar(reservaId);
async function iniciarGarantiaDeCheckIn({ pedido, reservaId, fechaHasta, claveIdempotencia }) {
  const clave = typeof claveIdempotencia === "string" && claveIdempotencia.trim() ? claveIdempotencia.trim() : crypto.randomUUID();
  const validada = validarEnCheckIn({ ...pedido, fechaHasta });
  const autorizada = await autorizarEnCheckIn({ validada, reservaId, claveIdempotencia: clave });
  return {
    liberar: () => liberarPreautorizacion(autorizada, clave),
    registrar: (idReserva) => registrarEnCheckIn(idReserva, autorizada, clave),
  };
}

// Resumen para pantallas (check-in y detalle): SIN token ni referencias internas.
async function obtenerResumenGarantias(reservaId) {
  const [reserva, estadia] = [
    await prisma.garantiaReserva.findUnique({ where: { reservaId } }),
    await prisma.garantiaEstadia.findUnique({ where: { reservaId } }),
  ];
  return {
    reserva: reserva
      ? {
          tipo: reserva.tipo,
          estado: reserva.estado,
          marca: reserva.marca,
          ultimos4: reserva.ultimos4,
          monto: Number(reserva.monto),
          // Una tarjeta guardada sirve para preautorizar en el check-in.
          tieneTarjeta: reserva.tipo === TIPO_GARANTIA.TARJETA && Boolean(reserva.token),
        }
      : null,
    estadia: estadia
      ? {
          tipo: estadia.tipo,
          estado: estadia.estado,
          monto: Number(estadia.monto),
          montoUsado: Number(estadia.montoUsado),
          marca: estadia.marca,
          ultimos4: estadia.ultimos4,
        }
      : null,
  };
}

module.exports = {
  validarEnCheckIn,
  autorizarEnCheckIn,
  registrarEnCheckIn,
  iniciarGarantiaDeCheckIn,
  obtenerResumenGarantias,
  ErrorDeNegocio,
  MEDIO_GARANTIA_TARJETA,
};
