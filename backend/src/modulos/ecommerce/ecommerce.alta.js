// Funciones PURAS del alta web (POST /api/web/reservas, HU-100/HU-102): sin
// base, sin pasarela y sin Express. Validación completa del cuerpo (regla 1),
// "mismos datos" para la idempotencia, armado del titular respetando la ficha
// existente (la web no la pisa) y la respuesta pública del contrato.
//
// La tarjeta llega SEPARADA del resto del cuerpo (el controlador la saca
// apenas entra). Número y CVV se validan acá y no salen nunca: ni en el
// resultado, ni en un error, ni en un log.
const { Prisma } = require("@prisma/client");
const { parsearFechaSinHora, hoyComoFechaUTC, edadEn, MAYORIA_EDAD } = require("../../lib/fechas");
const { normalizarTipoDocumento } = require("../../lib/tiposDocumento");
const { codigoPais } = require("../../lib/paises");
const { esEmail, esTelefono } = require("../../lib/contacto");
const { LIMITES_RESERVA } = require("../reservas/reservas.constantes");
const { ErrorWeb, CODIGO, datosInvalidos } = require("./ecommerce.errores");
const { validarCotizacion } = require("./ecommerce.validacion");
const { luhnValido: pasaLuhn } = require("../garantias/pasarela.servicio");

// Mismos valores que frontend/src/modulos/ecommerce/ecommerce.constantes.js.
const VERSION_POLITICAS = "2026-10-01";
const HORAS_LLEGADA = ["NO_SABE", "14-16", "16-18", "18-20", "20-22", "DESPUES_22"];
const MAX_SOLICITUDES = 500;
const MAX_EMAIL = 190;
const PATRON_CLAVE = /^[A-Za-z0-9-]{8,64}$/;
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRON_TELEFONO = /^[\d\s+\-()]{7,40}$/;
const MOTIVO_TARJETA_VENCIDA = "Tarjeta vencida";

const texto = (valor) => (typeof valor === "string" ? valor.trim() : "");
const isoDeFecha = (fecha) => fecha.toISOString().slice(0, 10);

function textoObligatorio(valor, campo, maximo, mensaje) {
  const t = texto(valor);
  if (!t || t.length > maximo) throw datosInvalidos(campo, mensaje);
  return t;
}

function pais(valor, campo, obligatorio) {
  const t = texto(valor).toUpperCase();
  if (!t && !obligatorio) return null;
  if (!t || codigoPais(t) !== t) throw datosInvalidos(campo, "Elegí un país de la lista.");
  return t;
}

function validarHuesped(h, fechaDesde) {
  const datos = h && typeof h === "object" ? h : {};
  const tipoDocumento = normalizarTipoDocumento(datos.tipoDocumento);
  if (!tipoDocumento) throw datosInvalidos("huesped.tipoDocumento", "Elegí un tipo de documento de la lista.");

  let nacimiento;
  try {
    nacimiento = parsearFechaSinHora(datos.fechaNacimiento, "La fecha de nacimiento");
  } catch (err) {
    throw datosInvalidos("huesped.fechaNacimiento", err.message);
  }
  if (nacimiento > hoyComoFechaUTC() || edadEn(nacimiento, fechaDesde) < MAYORIA_EDAD) {
    throw datosInvalidos("huesped.fechaNacimiento", `El titular tiene que tener al menos ${MAYORIA_EDAD} años en la fecha de ingreso.`);
  }

  const email = texto(datos.email).toLowerCase();
  if (!PATRON_EMAIL.test(email) || email.length > MAX_EMAIL) throw datosInvalidos("huesped.email", "Ingresá un email válido.");
  const telefono = texto(datos.telefono);
  if (!PATRON_TELEFONO.test(telefono) || !/\d/.test(telefono)) {
    throw datosInvalidos("huesped.telefono", "Ingresá un teléfono válido (números, espacios, +, - o paréntesis).");
  }

  return {
    nombres: textoObligatorio(datos.nombres, "huesped.nombres", LIMITES_RESERVA.nombres, "Completá tus nombres."),
    apellido: textoObligatorio(datos.apellido, "huesped.apellido", LIMITES_RESERVA.apellido, "Completá tu apellido."),
    tipoDocumento,
    paisDocumento: pais(datos.paisDocumento, "huesped.paisDocumento", true),
    numeroDocumento: textoObligatorio(
      datos.numeroDocumento,
      "huesped.numeroDocumento",
      LIMITES_RESERVA.numeroDocumento,
      "Completá el número de documento."
    ),
    fechaNacimiento: isoDeFecha(nacimiento),
    email,
    telefono,
    nacionalidad: pais(datos.nacionalidad, "huesped.nacionalidad", false),
    paisResidencia: pais(datos.paisResidencia, "huesped.paisResidencia", false),
  };
}

// Valida la forma de la tarjeta (400) y su vencimiento: vale hasta el último
// día de su mes. Ya vencida hoy → 402 "Tarjeta vencida" (se chequea primero:
// una tarjeta vencida también vence antes de la salida); vence antes de la
// salida → 422. Devuelve solo lo que se puede guardar (sin número ni CVV).
function validarTarjeta(tarjeta, fechaHasta) {
  const t = tarjeta && typeof tarjeta === "object" ? tarjeta : {};
  const titular = textoObligatorio(t.titular, "tarjeta.titular", 120, "Completá el nombre del titular de la tarjeta.");
  const numero = typeof t.numero === "string" || typeof t.numero === "number" ? String(t.numero).replace(/\s/g, "") : "";
  if (!/^\d{13,19}$/.test(numero) || !pasaLuhn(numero)) throw datosInvalidos("tarjeta.numero", "El número de tarjeta no es válido.");
  const mes = Number(t.vencimientoMes);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw datosInvalidos("tarjeta.vencimientoMes", "El mes de vencimiento no es válido.");
  const anio = Number(t.vencimientoAnio);
  if (!/^\d{4}$/.test(String(t.vencimientoAnio ?? ""))) throw datosInvalidos("tarjeta.vencimientoAnio", "El año de vencimiento no es válido.");
  if (!/^\d{3,4}$/.test(String(t.cvv ?? ""))) throw datosInvalidos("tarjeta.cvv", "El código de seguridad no es válido.");

  const ultimoDia = new Date(Date.UTC(anio, mes, 0));
  if (ultimoDia < hoyComoFechaUTC()) {
    throw new ErrorWeb(402, CODIGO.PAGO_RECHAZADO, MENSAJE_RECHAZO, { motivo: MOTIVO_TARJETA_VENCIDA });
  }
  if (ultimoDia < fechaHasta) throw new ErrorWeb(422, CODIGO.TARJETA_VENCE_ANTES);
  return { titular, vencimiento: `${String(mes).padStart(2, "0")}/${anio}`, ultimos4: numero.slice(-4) };
}

const MENSAJE_RECHAZO = "La tarjeta fue rechazada. Probá con otra tarjeta.";

// Regla 1: validación completa ANTES de tocar la base o la pasarela.
function validarAlta(cuerpo, tarjeta) {
  const datos = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
  const claveIdempotencia = texto(datos.claveIdempotencia);
  if (!PATRON_CLAVE.test(claveIdempotencia)) {
    throw datosInvalidos("claveIdempotencia", "Falta la clave del pedido o no es válida.");
  }
  // Fechas (entrada >= hoy en hora argentina, máximo 30 noches), plan y 1 a 3 líneas: mismas reglas que /cotizar.
  const base = validarCotizacion(datos);
  const totalEsperado = Number(datos.totalEsperado);
  if (datos.totalEsperado === null || datos.totalEsperado === "" || !Number.isFinite(totalEsperado) || totalEsperado <= 0) {
    throw datosInvalidos("totalEsperado", "Falta el total de la reserva.");
  }

  const huesped = validarHuesped(datos.huesped, base.fechaDesde);

  const horaEstimada = datos.llegada?.horaEstimada ?? null;
  if (horaEstimada !== null && !HORAS_LLEGADA.includes(horaEstimada)) {
    throw datosInvalidos("llegada.horaEstimada", "Elegí una hora estimada de llegada de la lista.");
  }
  const solicitudes = datos.solicitudesEspeciales == null ? "" : String(datos.solicitudesEspeciales);
  if (solicitudes.length > MAX_SOLICITUDES) {
    throw datosInvalidos("solicitudesEspeciales", `Las solicitudes pueden tener hasta ${MAX_SOLICITUDES} caracteres.`);
  }

  const consentimiento = datos.consentimiento ?? {};
  if (consentimiento.aceptaPoliticas !== true || consentimiento.versionPoliticas !== VERSION_POLITICAS) {
    throw datosInvalidos("consentimiento.aceptaPoliticas", "Tenés que aceptar los términos y las políticas.");
  }
  const aceptaComunicaciones = consentimiento.aceptaComunicaciones ?? false;
  if (typeof aceptaComunicaciones !== "boolean") {
    throw datosInvalidos("consentimiento.aceptaComunicaciones", "La preferencia de comunicaciones no es válida.");
  }

  const tarjetaGuardable = validarTarjeta(tarjeta, base.fechaHasta);

  return {
    ...base,
    claveIdempotencia,
    totalEsperado,
    huesped,
    horaEstimadaLlegada: horaEstimada,
    solicitudesEspeciales: solicitudes.trim() || null,
    versionPoliticas: VERSION_POLITICAS,
    aceptaComunicaciones,
    tarjeta: tarjetaGuardable,
  };
}

// "Mismos datos" (idempotencia, regla 3): fechas, plan, las líneas como
// multiconjunto de { tipo, adultos, menores } y la identidad del titular.
// Nunca la tarjeta.
function firmaAlta({ fechaDesde, fechaHasta, planTarifarioId, lineas, identidad }) {
  const lineasOrdenadas = lineas.map((l) => `${l.tipoHabitacionId}:${l.adultos}:${l.menores}`).sort();
  return JSON.stringify([fechaDesde, fechaHasta, Number(planTarifarioId), lineasOrdenadas, identidad ?? null]);
}

function firmaDeReserva(reserva) {
  return firmaAlta({
    fechaDesde: isoDeFecha(reserva.fechaDesde),
    fechaHasta: isoDeFecha(reserva.fechaHasta),
    planTarifarioId: reserva.planTarifarioId,
    lineas: reserva.reservaHabitaciones.map((rh) => ({
      tipoHabitacionId: rh.habitacion.tipoHabitacionId,
      adultos: rh.adultos,
      menores: rh.menores,
    })),
    identidad: reserva.huesped?.identidadDocumento,
  });
}

const vacio = (valor) => valor === null || valor === undefined || String(valor).trim() === "";
const contactoValido = (valor) => esEmail(valor) || esTelefono(valor);

// Titular para normalizarAltaReserva (decisión 3: la web no pisa la ficha).
//   - Sin ficha: los datos de la web, con contacto = email.
//   - Con ficha: los datos DE LA FICHA; la web solo completa lo vacío. Una
//     ficha vieja sin nombres y apellido separados manda su `nombre` (que no
//     cambia) y no se completan. Un contacto que no es email ni teléfono se
//     reemplaza por el email (avisoContacto).
// `residencia`: nacionalidad y país de residencia a escribir en la ficha
// (normalizarHuesped no los maneja), solo en los campos vacíos.
function armarTitular(web, ficha) {
  const residenciaWeb = { nacionalidad: web.nacionalidad, paisResidencia: web.paisResidencia };
  if (!ficha) {
    return {
      huesped: {
        nombres: web.nombres,
        apellido: web.apellido,
        tipoDocumento: web.tipoDocumento,
        paisDocumento: web.paisDocumento,
        numeroDocumento: web.numeroDocumento,
        fechaNacimiento: web.fechaNacimiento,
        contacto: web.email,
      },
      residencia: Object.fromEntries(Object.entries(residenciaWeb).filter(([, v]) => !vacio(v))),
      avisoContacto: null,
    };
  }

  const separados = !vacio(ficha.nombres) && !vacio(ficha.apellido);
  let contacto = ficha.contacto;
  let avisoContacto = null;
  if (vacio(contacto)) contacto = web.email;
  else if (!contactoValido(contacto)) {
    contacto = web.email;
    avisoContacto = "el contacto de la ficha no es un email ni un teléfono válido; se reemplazó por el email de la reserva web";
  }
  return {
    huesped: {
      ...(separados ? { nombres: ficha.nombres, apellido: ficha.apellido } : { nombre: ficha.nombre }),
      tipoDocumento: ficha.tipoDocumento,
      paisDocumento: ficha.paisDocumento,
      numeroDocumento: ficha.numeroDocumento,
      fechaNacimiento: ficha.fechaNacimiento ? isoDeFecha(new Date(ficha.fechaNacimiento)) : web.fechaNacimiento,
      contacto,
      ...(vacio(ficha.preferencias) ? {} : { preferencias: ficha.preferencias }),
    },
    residencia: Object.fromEntries(
      Object.entries(residenciaWeb).filter(([campo, v]) => !vacio(v) && vacio(ficha[campo]))
    ),
    avisoContacto,
  };
}

// Respuesta pública del alta (201) y de la repetición idempotente (200), a
// partir de lo que quedó en la base. Sin ids ni números de habitación.
function armarRespuestaAlta(reserva, email) {
  const plan = reserva.planTarifario;
  const total = reserva.reservaHabitaciones
    .flatMap((rh) => rh.reservaNoches)
    .reduce((acc, n) => acc.plus(new Prisma.Decimal(n.precioNoche)), new Prisma.Decimal(0));
  const cobrado = (reserva.pagosEstadia ?? [])
    .filter((p) => !p.anulado)
    .flatMap((p) => p.medios)
    .reduce((acc, m) => acc.plus(new Prisma.Decimal(m.importe)), new Prisma.Decimal(0));
  const noches = Math.round((reserva.fechaHasta.getTime() - reserva.fechaDesde.getTime()) / 86400000);
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
      horasCancelacionSinCargo: plan.reembolsable ? plan.horasCancelacionSinCargo : null,
    },
    total: total.toNumber(),
    cobradoAhora: plan.reembolsable ? 0 : cobrado.toNumber(),
    garantia: {
      tipo: plan.reembolsable ? "GARANTIA" : "PREPAGO",
      // De la garantía registrada (GarantiaReserva), la misma fuente que el resto del sistema.
      marca: reserva.garantiaReserva?.marca ?? null,
      ultimos4: reserva.garantiaReserva?.ultimos4 ?? null,
    },
    habitaciones: [...reserva.reservaHabitaciones]
      .sort((a, b) => a.id - b.id)
      .map((rh) => ({ tipo: rh.habitacion.tipoHabitacion.nombre, adultos: rh.adultos, menores: rh.menores })),
    email,
  };
}

module.exports = {
  VERSION_POLITICAS,
  HORAS_LLEGADA,
  MENSAJE_RECHAZO,
  MOTIVO_TARJETA_VENCIDA,
  validarAlta,
  validarTarjeta,
  firmaAlta,
  firmaDeReserva,
  armarTitular,
  armarRespuestaAlta,
};
