// Funciones PURAS de "Mi reserva" (HU-104): normalización del código y del
// email, cuál es el email de la reserva (decisión 6 del contrato), datos
// enmascarados y la evaluación de la cancelación online (decisión 14).
// Sin base, sin Express. Testeadas en miReserva.test.js.
const crypto = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { combinarFechaConHoraArgentina, ZONA_ARGENTINA } = require("../../lib/fechas");
const { esEmail } = require("../../lib/contacto");
const { HORA_CHECKIN } = require("../tarifas/tarifas.constantes");

const PATRON_CODIGO = /^[0-9A-F]{8}$/;
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MOTIVO = {
  CANCELADA: "Esta reserva ya fue cancelada.",
  NO_PRESENTADA: "La reserva figura como no presentada. Contactá a recepción.",
  LLEGADA_HOY: "Tu llegada es hoy. Para cualquier cambio, contactá a recepción.",
  LLEGADA_PASADA: "La fecha de llegada ya pasó. Para cualquier cambio, contactá a recepción.",
  CON_PAGO: "Tu reserva tiene un pago registrado. Para cancelarla, contactá a recepción.",
  SIN_TARJETA: "Cancelar tiene un cargo y no hay una tarjeta en garantía para cobrarlo. Para cancelar, contactá a recepción.",
};

// Código en mayúsculas, sin espacios ni guiones; email en minúsculas y sin espacios.
const normalizarCodigo = (valor) => String(valor ?? "").toUpperCase().replace(/[\s-]/g, "");
const normalizarEmail = (valor) => String(valor ?? "").toLowerCase().replace(/\s/g, "");
const codigoValido = (codigo) => PATRON_CODIGO.test(codigo);
const emailValido = (email) => PATRON_EMAIL.test(email) && email.length <= 190;

// Decisión 6: en una reserva web, el email de DatosReservaWeb; en una del
// mostrador, Huesped.contacto solo si es un email. null si no hay con qué comparar.
function emailDeLaReserva(reserva) {
  if (reserva?.datosWeb?.emailContacto) return normalizarEmail(reserva.datosWeb.emailContacto);
  const contacto = reserva?.huesped?.contacto;
  return esEmail(contacto) ? normalizarEmail(contacto) : null;
}

// Comparación en tiempo constante (sobre los hashes, así el largo no importa).
function mismoEmail(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const hb = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(ha, hb) && Boolean(a) && Boolean(b);
}

// "Juan P.": primer nombre + inicial del apellido.
function enmascararTitular(huesped) {
  const nombres = String(huesped?.nombres ?? "").trim();
  const apellido = String(huesped?.apellido ?? "").trim();
  if (nombres && apellido) return `${nombres.split(/\s+/)[0]} ${apellido[0].toUpperCase()}.`;
  // Ficha vieja: todo el nombre en un campo; primera palabra + inicial de la última.
  const partes = String(huesped?.nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

// "****222": asteriscos + los últimos 3 caracteres.
function enmascararDocumento(numero) {
  const texto = String(numero ?? "").replace(/\s/g, "");
  if (!texto) return "";
  return `****${texto.slice(-3)}`;
}

const isoDeFecha = (fecha) => new Date(fecha).toISOString().slice(0, 10);

function formatoPesos(monto) {
  const n = Number(monto);
  const entero = Math.round(n * 100) % 100 === 0;
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: entero ? 0 : 2 })}`;
}

// Cancelación online (decisión 14, ampliada en v9): se cancela online toda reserva Confirmada hasta las 14:00 del día
// de llegada, con o sin cargo. Orden:
//   1. estado (solo "Confirmada"; "Cancelada" y "No-show" lo dicen);
//   2. horario (desde las 14 h del día de llegada, hora argentina → recepción);
//   3. sin cargo con un pago registrado (seña u otro) → recepción;
//   4. con cargo: se usa la liquidación del módulo de garantías (previsualizarCierre de Ricardo, que envuelve
//      calcularPenalidad: acá no se calcula ningún precio):
//        - hay algo para devolver (reintegro manual) o la penalidad se reparte entre lo pagado y la tarjeta → recepción;
//        - hay que cobrar y no hay tarjeta en la garantía → recepción;
//        - hay que cobrar a la tarjeta de la garantía → online, con `cargo` { tipo: "COBRO", ... };
//        - la penalidad queda cubierta con lo ya pagado (NRF) → online, con `cargo` { tipo: "RETENIDO", ... }.
// `penalidad` es el resultado de calcularPenalidad (o null) y `liquidacion` el de previsualizarCierre (o null; solo
// hace falta cuando la penalidad aplica).
function llegadaSuperada(fechaDesde, ahora = new Date()) {
  const limite = combinarFechaConHoraArgentina(new Date(fechaDesde), HORA_CHECKIN.hora, HORA_CHECKIN.minuto);
  return new Date(ahora).getTime() >= limite.getTime();
}

const CONCEPTO_COBRO = "Cargo por cancelación";
const CONCEPTO_RETENIDO = "Importe pagado no reintegrable";

function nombreDeTarjeta(tarjeta) {
  const marca = String(tarjeta?.marca ?? "").trim();
  const marcaBonita = marca ? marca[0].toUpperCase() + marca.slice(1).toLowerCase() : "";
  return `tu tarjeta ${marcaBonita ? `${marcaBonita} ` : ""}terminada en ${tarjeta.ultimos4}`;
}

// Explicación corta de la regla de la penalidad, para la frase del cargo.
function explicacionDeRegla(regla) {
  if (regla === "PRIMERA_NOCHE") return "primera noche";
  if (regla === "TOTAL_NO_REEMBOLSABLE") return "tarifa no reembolsable";
  return "cargo por cancelación";
}

function evaluarCancelacion({ estado, fechaDesde, tienePagosActivos }, penalidad, ahora = new Date(), liquidacion = null) {
  const sinCancelar = (motivo, pen = null) => ({ puedeCancelarOnline: false, motivo, penalidad: pen, cargo: null });
  if (estado === "Cancelada") return sinCancelar(MOTIVO.CANCELADA);
  if (estado === "No-show") return sinCancelar(MOTIVO.NO_PRESENTADA);
  if (estado !== "Confirmada") return sinCancelar(null);

  const desde = new Date(fechaDesde);
  const penalidadPublica = penalidad
    ? {
        aplica: Boolean(penalidad.aplica),
        monto: Number(penalidad.monto ?? 0),
        limiteSinCargo: penalidad.limiteSinCargo ?? null,
        mensaje: penalidad.mensaje ?? "",
      }
    : null;
  if (llegadaSuperada(desde, ahora)) {
    const esHoy = isoDeFecha(desde) === new Date(ahora).toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
    return sinCancelar(esHoy ? MOTIVO.LLEGADA_HOY : MOTIVO.LLEGADA_PASADA, penalidadPublica);
  }
  if (!penalidadPublica) return sinCancelar(null);

  // Sin cargo.
  if (!(penalidadPublica.aplica && penalidadPublica.monto > 0)) {
    if (tienePagosActivos) return sinCancelar(MOTIVO.CON_PAGO, penalidadPublica);
    return { puedeCancelarOnline: true, motivo: null, penalidad: penalidadPublica, cargo: null };
  }

  // Con cargo: hace falta la liquidación del módulo de garantías.
  if (!liquidacion) return sinCancelar(null, penalidadPublica);
  if (liquidacion.devuelto > 0) return sinCancelar(MOTIVO.CON_PAGO, penalidadPublica);
  if (liquidacion.sinCobrar > 0) return sinCancelar(MOTIVO.SIN_TARJETA, penalidadPublica);
  if (liquidacion.retenido > 0 && liquidacion.aCobrarATarjeta > 0) return sinCancelar(MOTIVO.CON_PAGO, penalidadPublica);
  if (liquidacion.retenido > 0) {
    // La penalidad queda cubierta con lo ya pagado: no hay cobro nuevo y no se devuelve nada.
    const monto = Number(liquidacion.retenido);
    return {
      puedeCancelarOnline: true,
      motivo: null,
      penalidad: penalidadPublica,
      cargo: {
        tipo: "RETENIDO",
        monto,
        concepto: CONCEPTO_RETENIDO,
        texto: `Esta tarifa no admite devolución: no se reintegra el importe pagado (${formatoPesos(monto)}).`,
      },
    };
  }
  if (liquidacion.aCobrarATarjeta > 0 && liquidacion.tarjeta?.ultimos4) {
    const monto = Number(liquidacion.aCobrarATarjeta);
    return {
      puedeCancelarOnline: true,
      motivo: null,
      penalidad: penalidadPublica,
      cargo: {
        tipo: "COBRO",
        monto,
        concepto: CONCEPTO_COBRO,
        texto: `Cancelar tiene un cargo de ${formatoPesos(monto)} (${explicacionDeRegla(liquidacion.regla)}), que se cobra a ${nombreDeTarjeta(liquidacion.tarjeta)}.`,
      },
    };
  }
  return sinCancelar(MOTIVO.SIN_TARJETA, penalidadPublica);
}

const sumarDecimal = (valores) => valores.reduce((acc, v) => acc.plus(new Prisma.Decimal(v)), new Prisma.Decimal(0)).toNumber();

// Respuesta pública de Mi reserva: sin ids, sin números de habitación, sin
// documento ni email completos, sin datos de otras personas.
function armarRespuestaMiReserva(reserva, cancelacion) {
  const plan = reserva.planTarifario;
  const pagosActivos = (reserva.pagosEstadia ?? []).filter((p) => !p.anulado);
  const noches = Math.round((new Date(reserva.fechaHasta).getTime() - new Date(reserva.fechaDesde).getTime()) / 86400000);
  return {
    codigoConfirmacion: reserva.codigoConfirmacion,
    estado: reserva.estado,
    fechaDesde: isoDeFecha(reserva.fechaDesde),
    fechaHasta: isoDeFecha(reserva.fechaHasta),
    noches,
    plan: {
      codigo: plan.codigo,
      nombre: plan.nombre,
      reembolsable: plan.reembolsable,
      horasCancelacionSinCargo: plan.reembolsable ? (plan.horasCancelacionSinCargo ?? null) : null,
      penalidadNoShow: plan.penalidadNoShow,
    },
    habitaciones: [...reserva.reservaHabitaciones]
      .sort((a, b) => a.id - b.id)
      .map((rh) => ({ tipo: rh.habitacion.tipoHabitacion.nombre, adultos: rh.adultos, menores: rh.menores })),
    total: sumarDecimal(reserva.reservaHabitaciones.flatMap((rh) => rh.reservaNoches.map((n) => n.precioNoche))),
    cobrado: sumarDecimal(pagosActivos.flatMap((p) => p.medios.map((m) => m.importe))),
    // De la garantía registrada (GarantiaReserva), la misma que ve el mostrador.
    garantia: reserva.garantiaReserva?.ultimos4
      ? { tipo: plan.reembolsable ? "GARANTIA" : "PREPAGO", marca: reserva.garantiaReserva.marca, ultimos4: reserva.garantiaReserva.ultimos4 }
      : null,
    titular: enmascararTitular(reserva.huesped),
    documento: enmascararDocumento(reserva.huesped?.numeroDocumento),
    cancelacion,
  };
}

module.exports = {
  MOTIVO,
  normalizarCodigo,
  normalizarEmail,
  codigoValido,
  emailValido,
  emailDeLaReserva,
  mismoEmail,
  enmascararTitular,
  enmascararDocumento,
  evaluarCancelacion,
  llegadaSuperada,
  formatoPesos,
  armarRespuestaMiReserva,
};
