// Alta REAL de una reserva web — POST /api/web/reservas (HU-100, HU-102,
// HU-103). Una reserva web es una reserva normal del sistema (Reserva +
// ReservaNoche, creada con crearReservaEnTransaccion): la ven el mostrador,
// las llegadas, el check-in y el check-out. DatosReservaWeb es su
// complemento 1 a 1 (y lo que la marca como web).
//
// Orden (CONTRATO.md → "Cómo funciona por dentro"):
//   1. validación completa del cuerpo (ecommerce.alta.js), sin base ni pasarela;
//   2. idempotencia por claveIdempotencia (200 / 409 CLAVE_REUTILIZADA);
//   3. candidatas libres y precotización (409 SIN_DISPONIBILIDAD / PRECIO_CAMBIADO);
//   4. pasarela: GARANTIA (reembolsable) o PREAUTORIZACION (no reembolsable);
//   5. UNA transacción, solo con tx: lock, asignación, titular, alta, prepago
//      y DatosReservaWeb;
//   6. si la transacción falla: LIBERACION; si sale bien y es no
//      reembolsable: CAPTURA (y compensación si la captura falla);
//   7. relectura, email y respuesta.
//
// La tarjeta llega separada del cuerpo y solo se usa para validarla y para
// la pasarela: número y CVV nunca se guardan, se loguean ni se devuelven.
const crypto = require("node:crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const reservasServicio = require("../reservas/reservas.servicio");
const { MAX_INTENTOS_CODIGO } = require("../reservas/reservas.constantes");
const { claveDocumento } = require("../estadia/persona.servicio");
const pagoEstadiaServicio = require("../pagos-estadia/pagoEstadia.servicio");
const { CONCEPTO_PREPAGO } = require("../pagos-estadia/pagoEstadia.constantes");
const pasarela = require("./pasarelaSimulada");
const { ErrorWeb, CODIGO, datosInvalidos } = require("./ecommerce.errores");
const { elegirRepresentantes } = require("./ecommerce.transformacion");
const { tiposVendibles, planWeb, habitacionesLibres, CANAL_WEB } = require("./ecommerce.servicio");
const { validarAlta, firmaAlta, firmaDeReserva, armarTitular, armarRespuestaAlta, MENSAJE_RECHAZO } = require("./ecommerce.alta");
const emailWeb = require("./emailWeb.servicio");

const MEDIO_TARJETA_CREDITO = "Tarjeta crédito";
const MOTIVO_PAGO_NO_CAPTURADO = "Pago no capturado";
const MENSAJE_PAGO_NO_CAPTURADO = "No pudimos confirmar el pago. No se realizó ningún cargo.";

const isoDeFecha = (fecha) => fecha.toISOString().slice(0, 10);
const centavos = (n) => Math.round(Number(n) * 100);

const INCLUDE_RESPUESTA = {
  planTarifario: true,
  huesped: { select: { identidadDocumento: true } },
  reservaHabitaciones: {
    include: {
      habitacion: { select: { tipoHabitacionId: true, tipoHabitacion: { select: { nombre: true } } } },
      reservaNoches: { select: { precioNoche: true } },
    },
  },
  pagosEstadia: { where: { concepto: CONCEPTO_PREPAGO }, include: { medios: true } },
};

function esUnicoDuplicado(err, campo) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String(JSON.stringify(err.meta ?? {})).includes(campo)
  );
}

// Regla 3: misma clave + mismos datos → 200 con la reserva existente (sin
// pasarela ni email; email.enviado = null, "desconocido"); otros datos → 409.
async function repeticionIdempotente(datos, identidad) {
  const previa = await prisma.datosReservaWeb.findUnique({
    where: { claveIdempotencia: datos.claveIdempotencia },
    include: { reserva: { include: INCLUDE_RESPUESTA } },
  });
  if (!previa) return null;
  const firmaPedido = firmaAlta({
    fechaDesde: isoDeFecha(datos.fechaDesde),
    fechaHasta: isoDeFecha(datos.fechaHasta),
    planTarifarioId: datos.planTarifarioId,
    lineas: datos.habitaciones,
    identidad,
  });
  if (firmaDeReserva(previa.reserva) !== firmaPedido) throw new ErrorWeb(409, CODIGO.CLAVE_REUTILIZADA);
  return { status: 200, cuerpo: armarRespuestaAlta(previa.reserva, previa, { enviado: null }) };
}

async function precotizar(datos, representantes) {
  const cotizacion = await reservasServicio.cotizarParaReserva({
    fechaDesde: isoDeFecha(datos.fechaDesde),
    fechaHasta: isoDeFecha(datos.fechaHasta),
    planTarifarioId: datos.planTarifarioId,
    habitaciones: datos.habitaciones.map((l, i) => ({ habitacionId: representantes[i], adultos: l.adultos, menores: l.menores })),
    canal: CANAL_WEB,
  });
  const plan = cotizacion.planes?.[0];
  if (!plan) throw datosInvalidos("planTarifarioId", "La tarifa elegida no está disponible para estas fechas.");
  return plan.total;
}

function precioCambiado(totalNuevo) {
  return new ErrorWeb(409, CODIGO.PRECIO_CAMBIADO, undefined, { totalNuevo });
}

// Paso 5: todo adentro de UNA transacción, solo con tx.
async function transaccionAlta(tx, { datos, candidatas, pago, total, reembolsable }) {
  const ids = candidatas.map((h) => h.id);
  // a. Lock de las filas de todas las candidatas (mismo patrón que crearReservaEnTransaccion).
  await tx.$queryRaw(Prisma.sql`SELECT id FROM reservas_habitaciones WHERE habitacionId IN (${Prisma.join(ids)}) FOR UPDATE`);
  // b. Una sola consulta de conflictos para todas.
  const conflictos = await reservasServicio.buscarConflictos(tx, {
    habitacionIds: ids,
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
  });
  const ocupadas = new Set(conflictos.map((c) => c.habitacionId));
  // c. Asignación con la MISMA función que la cotización.
  const asignadas = elegirRepresentantes(
    candidatas.filter((h) => !ocupadas.has(h.id)),
    datos.habitaciones
  );
  if (!asignadas) throw new ErrorWeb(409, CODIGO.SIN_DISPONIBILIDAD);

  // d. Titular: la web no pisa la ficha existente (decisión 3).
  const identidad = claveDocumento(datos.huesped);
  const ficha = identidad ? await tx.huesped.findUnique({ where: { identidadDocumento: identidad } }) : null;
  const { huesped, residencia, avisoContacto } = armarTitular(datos.huesped, ficha);
  if (avisoContacto) console.warn(`[ecommerce] Ficha de huésped ${ficha.id}: ${avisoContacto}.`);

  // e. Alta con el mismo camino que el mostrador.
  let normalizado;
  try {
    normalizado = reservasServicio.normalizarAltaReserva({
      fechaDesde: isoDeFecha(datos.fechaDesde),
      fechaHasta: isoDeFecha(datos.fechaHasta),
      habitaciones: datos.habitaciones.map((l, i) => ({ habitacionId: asignadas[i], adultos: l.adultos, menores: l.menores })),
      planTarifarioId: datos.planTarifarioId,
      totalEsperado: datos.totalEsperado,
      huesped,
      origen: CANAL_WEB,
    });
  } catch (err) {
    // Con una ficha existente, la fecha de nacimiento que vale es la de la ficha.
    if (err instanceof reservasServicio.ErrorDeNegocio && /18 años/.test(err.message)) {
      throw datosInvalidos("huesped.fechaNacimiento", err.message);
    }
    throw err;
  }
  const reserva = await reservasServicio.crearReservaEnTransaccion(tx, normalizado);

  // Nacionalidad y país de residencia (normalizarHuesped no los maneja): solo los vacíos.
  if (Object.keys(residencia).length > 0) {
    await tx.huesped.update({ where: { id: reserva.huespedId }, data: residencia });
  }

  // f. Solo no reembolsable: el prepago, con la referencia de la preautorización.
  if (!reembolsable) {
    await pagoEstadiaServicio.crearPagoEnTransaccion(tx, {
      reservaId: reserva.id,
      medios: [{ tipo: MEDIO_TARJETA_CREDITO, importe: total, referencia: pago.referencia }],
      concepto: CONCEPTO_PREPAGO,
    });
  }

  // g. El complemento web (sin número ni CVV).
  await tx.datosReservaWeb.create({
    data: {
      reservaId: reserva.id,
      claveIdempotencia: datos.claveIdempotencia,
      emailContacto: datos.huesped.email,
      telefonoContacto: datos.huesped.telefono,
      horaEstimadaLlegada: datos.horaEstimadaLlegada,
      solicitudesEspeciales: datos.solicitudesEspeciales,
      aceptaPoliticasEn: new Date(),
      versionPoliticas: datos.versionPoliticas,
      aceptaComunicaciones: datos.aceptaComunicaciones,
      tarjetaTitular: datos.tarjeta.titular,
      tarjetaMarca: pago.marca,
      tarjetaUltimos4: pago.ultimos4,
      tarjetaVencimiento: datos.tarjeta.vencimiento,
      garantiaToken: reembolsable ? pago.token : null,
      pasarelaReferencia: pago.referencia,
    },
  });
  return reserva.id;
}

async function liberar(referencia, claveIdempotencia) {
  try {
    const r = await pasarela.procesarTarjeta({ operacion: pasarela.OPERACION.LIBERACION, referenciaPrevia: referencia, claveIdempotencia });
    if (!r.aprobado) console.error(`[ecommerce] No se pudo liberar la preautorización ${referencia}: ${r.motivoRechazo}`);
  } catch (err) {
    console.error(`[ecommerce] No se pudo liberar la preautorización ${referencia}:`, err?.message);
  }
}

// Regla 8: la captura falló después de crear la reserva. Se compensa con las
// funciones existentes, en este orden: anular el prepago con su motivo (antes
// de cancelar: con 24 h o más de anticipación cancelarReserva anularía los
// pagos con otro motivo), cancelar la reserva (ya no encuentra pagos activos)
// y liberar la preautorización. Cada paso que falla se loguea y se sigue.
async function compensarCapturaFallida(reservaId, referencia, claveIdempotencia) {
  try {
    const prepago = await prisma.pagoEstadia.findFirst({
      where: { reservaId, concepto: CONCEPTO_PREPAGO, anulado: false },
      select: { id: true },
    });
    if (prepago) await pagoEstadiaServicio.anularPago(prepago.id, MOTIVO_PAGO_NO_CAPTURADO);
  } catch (err) {
    console.error(`[ecommerce] Compensación: no se pudo anular el prepago de la reserva ${reservaId}:`, err?.message);
  }
  try {
    await reservasServicio.cancelarReserva(reservaId, { motivoCancelacion: MOTIVO_PAGO_NO_CAPTURADO });
  } catch (err) {
    console.error(`[ecommerce] Compensación: no se pudo cancelar la reserva ${reservaId}:`, err?.message);
  }
  await liberar(referencia, claveIdempotencia);
}

async function crearReservaWeb(cuerpo, tarjeta) {
  // 1. Validación completa (400 / 402 tarjeta vencida / 422), sin base ni pasarela.
  const datos = validarAlta(cuerpo, tarjeta);
  const identidad = claveDocumento(datos.huesped);

  // 2. Idempotencia.
  const repetida = await repeticionIdempotente(datos, identidad);
  if (repetida) return repetida;

  // Plan y tipos vendibles en la web.
  const plan = await planWeb(datos.planTarifarioId);
  if (!plan) throw datosInvalidos("planTarifarioId", "La tarifa elegida no está disponible.");
  const tipos = new Set((await tiposVendibles()).map((t) => t.tipoHabitacionId));
  datos.habitaciones.forEach((l, i) => {
    if (!tipos.has(l.tipoHabitacionId)) {
      throw datosInvalidos(`habitaciones[${i}].tipoHabitacionId`, "El tipo de habitación elegido no está disponible.");
    }
  });

  // 3. Candidatas y precotización, fuera de la transacción.
  const fechas = { fechaDesde: isoDeFecha(datos.fechaDesde), fechaHasta: isoDeFecha(datos.fechaHasta) };
  const candidatas = await habitacionesLibres({ ...fechas, lineas: datos.habitaciones });
  const sinCandidata = datos.habitaciones.some(
    (l) => !candidatas.some((h) => h.tipoHabitacionId === l.tipoHabitacionId && h.capacidad >= l.adultos + l.menores)
  );
  const representantes = sinCandidata ? null : elegirRepresentantes(candidatas, datos.habitaciones);
  if (!representantes) throw new ErrorWeb(409, CODIGO.SIN_DISPONIBILIDAD);
  const total = await precotizar(datos, representantes);
  if (centavos(total) !== centavos(datos.totalEsperado)) throw precioCambiado(total);

  // 4. Pasarela. Cada intento de alta pide su propia preautorización (si un
  // intento anterior falló, su preautorización ya se liberó); la garantía sí
  // se pide con la clave del pedido.
  const reembolsable = plan.reembolsable;
  const pago = await pasarela.procesarTarjeta({
    operacion: reembolsable ? pasarela.OPERACION.GARANTIA : pasarela.OPERACION.PREAUTORIZACION,
    monto: reembolsable ? new Prisma.Decimal(0) : new Prisma.Decimal(total),
    tarjeta,
    claveIdempotencia: reembolsable ? datos.claveIdempotencia : `${datos.claveIdempotencia}:${crypto.randomUUID()}`,
  });
  if (!pago.aprobado) throw new ErrorWeb(402, CODIGO.PAGO_RECHAZADO, MENSAJE_RECHAZO, { motivo: pago.motivoRechazo });

  // 5. Transacción (con reintento solo ante un choque de codigoConfirmacion, como crearReserva).
  let reservaId;
  try {
    for (let intento = 0; ; intento += 1) {
      try {
        reservaId = await prisma.$transaction(
          (tx) => transaccionAlta(tx, { datos, candidatas, pago, total, reembolsable }),
          OPCIONES_TRANSACCION
        );
        break;
      } catch (err) {
        if (!esUnicoDuplicado(err, "codigoConfirmacion") || intento + 1 >= MAX_INTENTOS_CODIGO) throw err;
      }
    }
  } catch (err) {
    // 6. Falló: nada quedó en la base. Se libera la preautorización.
    if (!reembolsable) await liberar(pago.referencia, datos.claveIdempotencia);
    // Dos pedidos con la misma clave chocaron: misma regla de idempotencia.
    if (esUnicoDuplicado(err, "claveIdempotencia")) {
      const repetidaTarde = await repeticionIdempotente(datos, identidad);
      if (repetidaTarde) return repetidaTarde;
    }
    // Un 409 de crearReservaEnTransaccion es un cambio de precio: se recotiza afuera.
    if (err instanceof reservasServicio.ErrorDeNegocio && err.statusCode === 409) {
      const totalNuevo = await precotizar(datos, representantes).catch(() => null);
      throw totalNuevo === null ? new ErrorWeb(409, CODIGO.PRECIO_CAMBIADO) : precioCambiado(totalNuevo);
    }
    throw err;
  }

  // 6. No reembolsable: captura; si falla, compensación y 402.
  if (!reembolsable) {
    const captura = await pasarela.procesarTarjeta({
      operacion: pasarela.OPERACION.CAPTURA,
      referenciaPrevia: pago.referencia,
      claveIdempotencia: datos.claveIdempotencia,
    });
    if (!captura.aprobado) {
      await compensarCapturaFallida(reservaId, pago.referencia, datos.claveIdempotencia);
      throw new ErrorWeb(402, CODIGO.PAGO_RECHAZADO, MENSAJE_PAGO_NO_CAPTURADO, { motivo: captura.motivoRechazo });
    }
  }

  // 7. Relectura, email y respuesta.
  const reserva = await prisma.reserva.findUnique({ where: { id: reservaId }, include: { ...INCLUDE_RESPUESTA, datosWeb: true } });
  const respuesta = armarRespuestaAlta(reserva, reserva.datosWeb, { enviado: false });
  respuesta.email = await emailWeb.enviarConfirmacion(respuesta, reserva.datosWeb.emailContacto);
  return { status: 201, cuerpo: respuesta };
}

module.exports = { crearReservaWeb, MOTIVO_PAGO_NO_CAPTURADO, MENSAJE_PAGO_NO_CAPTURADO };
