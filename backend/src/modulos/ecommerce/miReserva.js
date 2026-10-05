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
  LLEGADA_HOY: "Tu llegada es hoy. Para cualquier cambio, contactá a recepción.",
  LLEGADA_PASADA: "La fecha de llegada ya pasó. Para cualquier cambio, contactá a recepción.",
  CON_PAGO: "Tu reserva tiene un pago registrado. Para cancelarla, contactá a recepción.",
  NO_REEMBOLSABLE: "Esta tarifa no admite reintegro. Si necesitás cancelar, contactá a recepción.",
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

// Decisión 14 — cancelación online. Orden:
//   1. estado (solo "Confirmada" se puede cancelar; "Cancelada" lo dice);
//   2. horario (después de las 14 h del día de llegada, hora argentina);
//   3. pagos activos (seña u otro PagoEstadia: lo resuelve recepción);
//   4. plan (no reembolsable);
//   5. penalidad de calcularPenalidad (solo sin cargo).
// `penalidad` es el resultado de calcularPenalidad (o null si no se calculó).
function evaluarCancelacion({ estado, fechaDesde, reembolsable, tienePagosActivos }, penalidad, ahora = new Date()) {
  const sinCancelar = (motivo, pen = null) => ({ puedeCancelarOnline: false, motivo, penalidad: pen });
  if (estado === "Cancelada") return sinCancelar(MOTIVO.CANCELADA);
  if (estado !== "Confirmada") return sinCancelar(null);

  const desde = new Date(fechaDesde);
  const limiteLlegada = combinarFechaConHoraArgentina(desde, HORA_CHECKIN.hora, HORA_CHECKIN.minuto);
  const penalidadPublica = penalidad
    ? {
        aplica: Boolean(penalidad.aplica),
        monto: Number(penalidad.monto ?? 0),
        limiteSinCargo: penalidad.limiteSinCargo ?? null,
        mensaje: penalidad.mensaje ?? "",
      }
    : null;
  if (new Date(ahora).getTime() >= limiteLlegada.getTime()) {
    const esHoy = isoDeFecha(desde) === new Date(ahora).toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
    return sinCancelar(esHoy ? MOTIVO.LLEGADA_HOY : MOTIVO.LLEGADA_PASADA, penalidadPublica);
  }
  if (tienePagosActivos) return sinCancelar(MOTIVO.CON_PAGO, penalidadPublica);
  if (!reembolsable) return sinCancelar(MOTIVO.NO_REEMBOLSABLE, penalidadPublica);
  if (!penalidadPublica) return sinCancelar(null);
  if (penalidadPublica.aplica && penalidadPublica.monto > 0) {
    const explicacion = penalidadPublica.mensaje.replace(/\.$/, "").toLowerCase();
    return sinCancelar(
      `Cancelar ahora tiene un cargo de ${formatoPesos(penalidadPublica.monto)} (${explicacion}). Para cancelar, contactá a recepción.`,
      penalidadPublica
    );
  }
  return { puedeCancelarOnline: true, motivo: null, penalidad: penalidadPublica };
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
    garantia: reserva.datosWeb
      ? { tipo: plan.reembolsable ? "GARANTIA" : "PREPAGO", marca: reserva.datosWeb.tarjetaMarca, ultimos4: reserva.datosWeb.tarjetaUltimos4 }
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
  armarRespuestaMiReserva,
};
