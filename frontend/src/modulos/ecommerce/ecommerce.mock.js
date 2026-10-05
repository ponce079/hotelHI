// Mock de /api/web — responde con la forma EXACTA de docs/ecommerce/CONTRATO.md.
// Solo en desarrollo: se activa con npm run dev y VITE_ECOMMERCE_MOCK=true
// (frontend/.env.local); un build de producción nunca lo usa (usarMock en
// ecommerce.api.js). Solo Gimena lo cambia. Nunca muestra número de
// habitación, piso ni cantidad de libres.
//
// Escenarios forzables con ?mockEscenario=... en la URL de la página:
//   PRECIO_CAMBIADO     crearReserva → 409 con totalNuevo (+10 %), hasta que
//                       totalEsperado sea igual a totalNuevo.
//   SIN_DISPONIBILIDAD  Simple sale "Sin disponibilidad para estas fechas";
//                       crearReserva → 409.
//   CLAVE_REUTILIZADA   crearReserva → 409 con la primera clave; con una
//                       clave nueva funciona.
//   ERROR_INTERNO       todas las llamadas → 500.
//   DEMASIADOS_INTENTOS todas las llamadas → 429.
// Tarjetas (mismas reglas que la pasarela simulada del backend):
// 4242424242424242 aprobada; terminada en 0069 → rechaza todo ("Tarjeta
// vencida"); terminada en 0002 → rechaza la tarifa no reembolsable ("Fondos
// insuficientes") pero ACEPTA la flexible (la garantía de monto 0 no mira el
// saldo); sin Luhn → DATOS_INVALIDOS (tarjeta.numero); ya vencida hoy → 402
// "Tarjeta vencida"; vence antes de la salida → 422 TARJETA_VENCE_ANTES.
//
// Mi reserva (código + email, decisión 6 de CONTRATO.md). Online solo se
// cancela sin cargo; en los demás casos la respuesta trae el motivo:
//   3FA9C21B + demo@hotel.com        reserva WEB flexible, en plazo: se cancela.
//   B81D90E4 + mostrador@hotel.com   reserva del mostrador cuyo contacto es un
//                                    email, flexible y en plazo: se cancela.
//   7C04E5A2                         reserva del mostrador con teléfono como
//                                    único contacto: siempre NO_ENCONTRADA.
//   5D21A7F0 + nrf@hotel.com         reserva WEB no reembolsable (prepagada).
//   9E4B0C37 + plazo@hotel.com       reserva WEB flexible fuera de plazo (con cargo).
//   A6E3F218 + sena@hotel.com        reserva del mostrador con una seña registrada.
import {
  CLAVE_IDEMPOTENCIA_MAX,
  CLAVE_IDEMPOTENCIA_MIN,
  CODIGO_ERROR,
  HORAS_LLEGADA,
  EDAD_MINIMA_TITULAR,
  MAX_HABITACIONES_WEB,
  MAX_SOLICITUDES,
  VERSION_POLITICAS,
  codigoPais,
  normalizarTipoDocumento,
} from "./ecommerce.constantes";
import { calcularNoches } from "./formato";

export const ESCENARIOS_MOCK = [
  "PRECIO_CAMBIADO",
  "SIN_DISPONIBILIDAD",
  "CLAVE_REUTILIZADA",
  "ERROR_INTERNO",
  "DEMASIADOS_INTENTOS",
];

const TIPOS = [
  { tipoHabitacionId: 1, nombre: "Simple", capacidadMaxima: 2, precioNoche: 20000, ultimasDisponibles: false },
  { tipoHabitacionId: 2, nombre: "Doble", capacidadMaxima: 4, precioNoche: 25000, ultimasDisponibles: true },
];

// Mismos códigos, nombres y condiciones que backend/scripts/seed-tarifas.js
// (BAR base; NRF derivado de BAR con −15 %).
const PLANES = [
  {
    planTarifarioId: 1,
    codigo: "BAR",
    nombre: "Best Available Rate",
    reembolsable: true,
    horasCancelacionSinCargo: 48,
    penalidadNoShow: "PRIMERA_NOCHE",
    descuento: 0,
  },
  {
    planTarifarioId: 2,
    codigo: "NRF",
    nombre: "No Reembolsable",
    reembolsable: false,
    horasCancelacionSinCargo: null,
    penalidadNoShow: "TOTAL_ESTADIA",
    descuento: 0.15,
  },
];

const PLAN_BAR = {
  codigo: "BAR",
  nombre: "Best Available Rate",
  reembolsable: true,
  horasCancelacionSinCargo: 48,
  penalidadNoShow: "PRIMERA_NOCHE",
};
const PLAN_NRF = {
  codigo: "NRF",
  nombre: "Non Refundable Rate",
  reembolsable: false,
  horasCancelacionSinCargo: null,
  penalidadNoShow: "TOTAL",
};
const SIN_CARGO = {
  puedeCancelarOnline: true,
  motivo: null,
  penalidad: { aplica: false, monto: 0, limiteSinCargo: "2026-11-18T17:00:00.000Z", mensaje: "Cancelación sin cargo." },
};
const MOTIVO_CANCELADA = "Esta reserva ya fue cancelada.";

// Misma forma que POST /api/web/mi-reserva (CONTRATO.md → "Mi reserva").
const RESERVA_DEMO = {
  codigoConfirmacion: "3FA9C21B",
  estado: "Confirmada",
  fechaDesde: "2026-11-20",
  fechaHasta: "2026-11-23",
  noches: 3,
  plan: PLAN_BAR,
  habitaciones: [{ tipo: "Doble", adultos: 2, menores: 1 }],
  total: 75000,
  cobrado: 0,
  garantia: { tipo: "GARANTIA", marca: "VISA", ultimos4: "4242" },
  titular: "Juan P.",
  documento: "****222",
  cancelacion: SIN_CARGO,
};

// Reservas que encuentra Mi reserva. emailWeb = DatosReservaWeb.emailContacto
// (reserva web); contacto = Huesped.contacto (reserva del mostrador: solo
// sirve si es un email).
const RESERVAS_MI_RESERVA = [
  { codigo: "3FA9C21B", emailWeb: "demo@hotel.com", contacto: "demo@hotel.com", reserva: RESERVA_DEMO },
  {
    codigo: "B81D90E4",
    emailWeb: null,
    contacto: "mostrador@hotel.com",
    reserva: { ...RESERVA_DEMO, codigoConfirmacion: "B81D90E4", garantia: null, titular: "Ana M.", documento: "****318" },
  },
  {
    codigo: "7C04E5A2",
    emailWeb: null,
    contacto: "+54 9 387 555-0101",
    reserva: { ...RESERVA_DEMO, codigoConfirmacion: "7C04E5A2", garantia: null, titular: "Luis R.", documento: "****907" },
  },
  {
    codigo: "5D21A7F0",
    emailWeb: "nrf@hotel.com",
    contacto: "nrf@hotel.com",
    reserva: {
      ...RESERVA_DEMO,
      codigoConfirmacion: "5D21A7F0",
      fechaDesde: "2026-12-04",
      fechaHasta: "2026-12-06",
      noches: 2,
      plan: PLAN_NRF,
      habitaciones: [{ tipo: "Simple", adultos: 1, menores: 0 }],
      total: 42500,
      cobrado: 42500,
      garantia: { tipo: "PREPAGO", marca: "MASTERCARD", ultimos4: "4444" },
      titular: "Carla G.",
      documento: "****561",
      cancelacion: {
        puedeCancelarOnline: false,
        motivo: "Esta tarifa no admite reintegro. Si necesitás cancelar, contactá a recepción.",
        penalidad: { aplica: true, monto: 42500, limiteSinCargo: null, mensaje: "Tarifa no reembolsable: se cobra el total." },
      },
    },
  },
  {
    codigo: "9E4B0C37",
    emailWeb: "plazo@hotel.com",
    contacto: "plazo@hotel.com",
    reserva: {
      ...RESERVA_DEMO,
      codigoConfirmacion: "9E4B0C37",
      fechaDesde: "2026-10-06",
      fechaHasta: "2026-10-08",
      noches: 2,
      total: 50000,
      titular: "Pedro S.",
      documento: "****730",
      cancelacion: {
        puedeCancelarOnline: false,
        motivo:
          "Cancelar ahora tiene un cargo de $ 25.000 (ya pasó el plazo de cancelación sin cargo: se cobra la primera noche). Para cancelar, contactá a recepción.",
        penalidad: {
          aplica: true,
          monto: 25000,
          limiteSinCargo: "2026-10-04T17:00:00.000Z",
          mensaje: "Ya pasó el plazo de cancelación sin cargo: se cobra la primera noche.",
        },
      },
    },
  },
  {
    codigo: "A6E3F218",
    emailWeb: null,
    contacto: "sena@hotel.com",
    reserva: {
      ...RESERVA_DEMO,
      codigoConfirmacion: "A6E3F218",
      cobrado: 30000,
      garantia: null,
      titular: "Marta L.",
      documento: "****114",
      cancelacion: {
        ...SIN_CARGO,
        puedeCancelarOnline: false,
        motivo: "Tu reserva tiene un pago registrado. Para cancelarla, contactá a recepción.",
      },
    },
  },
];

// Estado en memoria (se pierde al recargar, igual que un servidor reiniciado).
const estado = {
  reservasPorClave: new Map(), // clave → { huella, respuesta }
  claveReutilizadaDisparada: false,
  canceladas: new Set(), // códigos cancelados desde Mi reserva
};

export function reiniciarMock() {
  estado.reservasPorClave.clear();
  estado.claveReutilizadaDisparada = false;
  estado.canceladas.clear();
}

// --- Utilidades --------------------------------------------------------------

function escenarioActual() {
  try {
    const valor = new URLSearchParams(window.location.search).get("mockEscenario");
    return ESCENARIOS_MOCK.includes(valor) ? valor : null;
  } catch {
    return null;
  }
}

function demora() {
  if (import.meta.env.MODE === "test") return Promise.resolve();
  const ms = 300 + Math.floor(Math.random() * 300);
  return new Promise((resolver) => setTimeout(resolver, ms));
}

// Mismo formato que un error normalizado de ecommerce.api.js.
function error(status, codigo, mensaje, extra = {}) {
  return { status, codigo, mensaje, ...extra };
}

const redondear = (n) => Math.round(n * 100) / 100;

function precioPlan(tipo, plan, noches) {
  const porNoche = redondear(tipo.precioNoche * (1 - plan.descuento));
  return { total: redondear(porNoche * noches), promedioPorNoche: porNoche };
}

function planConPrecio(tipo, plan, noches) {
  const { descuento: _descuento, ...publico } = plan;
  return { ...publico, ...precioPlan(tipo, plan, noches) };
}

function validarFechas(fechaDesde, fechaHasta) {
  const noches = calcularNoches(fechaDesde, fechaHasta);
  if (!fechaDesde || !fechaHasta || noches < 1) {
    throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Las fechas no son válidas.", { campo: "fechaHasta" });
  }
  return noches;
}

function validarHabitaciones(habitaciones) {
  if (!Array.isArray(habitaciones) || habitaciones.length < 1 || habitaciones.length > MAX_HABITACIONES_WEB) {
    throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, `Se pueden reservar de 1 a ${MAX_HABITACIONES_WEB} habitaciones.`, {
      campo: "habitaciones",
    });
  }
  return habitaciones.map((h, i) => {
    const tipo = TIPOS.find((t) => t.tipoHabitacionId === Number(h.tipoHabitacionId));
    if (!tipo) throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "El tipo de habitación no existe.", { campo: `habitaciones[${i}].tipoHabitacionId` });
    const adultos = Number(h.adultos);
    const menores = Number(h.menores ?? 0);
    if (!(adultos >= 1)) throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Tiene que haber al menos 1 adulto.", { campo: `habitaciones[${i}].adultos` });
    if (adultos + menores > tipo.capacidadMaxima)
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, `La habitación ${tipo.nombre} admite hasta ${tipo.capacidadMaxima} personas.`, {
        campo: `habitaciones[${i}]`,
      });
    return { tipo, adultos, menores };
  });
}

function buscarPlan(planTarifarioId) {
  const plan = PLANES.find((p) => p.planTarifarioId === Number(planTarifarioId));
  if (!plan) throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "El plan no existe.", { campo: "planTarifarioId" });
  return plan;
}

function cotizacionInterna({ fechaDesde, fechaHasta, planTarifarioId, habitaciones }) {
  const noches = validarFechas(fechaDesde, fechaHasta);
  const plan = buscarPlan(planTarifarioId);
  const lineas = validarHabitaciones(habitaciones).map(({ tipo, adultos, menores }) => ({
    tipo: tipo.nombre,
    adultos,
    menores,
    subtotal: precioPlan(tipo, plan, noches).total,
  }));
  const total = redondear(lineas.reduce((s, l) => s + l.subtotal, 0));
  return { noches, plan, lineas, total };
}

export function pasaLuhn(numero) {
  const digitos = String(numero ?? "").replace(/\s+/g, "");
  if (!/^\d{12,19}$/.test(digitos)) return false;
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

function marcaDe(numero) {
  if (/^4/.test(numero)) return "VISA";
  const dos = Number(numero.slice(0, 2));
  const cuatro = Number(numero.slice(0, 4));
  if ((dos >= 51 && dos <= 55) || (cuatro >= 2221 && cuatro <= 2720)) return "MASTERCARD";
  if (/^3[47]/.test(numero)) return "AMEX";
  return "OTRA";
}

// "Mismos datos" para la idempotencia, igual que el backend: fechas, plan,
// las líneas como multiconjunto de { tipo, adultos, menores } y la identidad
// del titular (tipo + país + número). Nunca la tarjeta.
function firma(cuerpo) {
  const h = cuerpo.huesped ?? {};
  const lineas = (cuerpo.habitaciones ?? []).map((l) => `${Number(l.tipoHabitacionId)}:${Number(l.adultos)}:${Number(l.menores ?? 0)}`).sort();
  const identidad = [h.tipoDocumento, h.paisDocumento, h.numeroDocumento].map((v) => String(v ?? "").trim().toUpperCase().replace(/\s/g, ""));
  return JSON.stringify([cuerpo.fechaDesde, cuerpo.fechaHasta, Number(cuerpo.planTarifarioId), lineas, identidad]);
}

const PATRON_CLAVE = /^[A-Za-z0-9-]{8,64}$/;
const PATRON_TELEFONO = /^[\d\s+\-()]{7,40}$/;

function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

// Mismo formato que el código del sistema (generarCodigoConfirmacion en
// reservas.servicio.js): 8 caracteres hexadecimales en mayúsculas.
function generarCodigo() {
  let codigo = "";
  for (let i = 0; i < 8; i++) codigo += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  return codigo;
}

const esEmail = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor ?? "").trim());

// Edad cumplida en una fecha (las dos en AAAA-MM-DD).
function edadEn(nacimiento, fecha) {
  const [an, mn, dn] = nacimiento.split("-").map(Number);
  const [af, mf, df] = fecha.split("-").map(Number);
  return af - an - (mf < mn || (mf === mn && df < dn) ? 1 : 0);
}

// Titular = ficha Huesped del sistema (CONTRATO.md → Huésped).
function validarHuesped(huesped, fechaDesde) {
  const invalido = (campo, mensaje) => error(400, CODIGO_ERROR.DATOS_INVALIDOS, mensaje, { campo: `huesped.${campo}` });
  const campos = [
    "nombres",
    "apellido",
    "tipoDocumento",
    "paisDocumento",
    "numeroDocumento",
    "fechaNacimiento",
    "email",
    "telefono",
  ];
  for (const campo of campos) {
    if (!String(huesped[campo] ?? "").trim()) throw invalido(campo, "Completá todos los datos del titular.");
  }
  if (!normalizarTipoDocumento(huesped.tipoDocumento)) throw invalido("tipoDocumento", "Elegí un tipo de documento de la lista.");
  for (const campo of ["paisDocumento", "nacionalidad", "paisResidencia"]) {
    // Nacionalidad y país de residencia son opcionales; si vienen, ISO-2 válidos.
    if (campo !== "paisDocumento" && !String(huesped[campo] ?? "").trim()) continue;
    if (codigoPais(huesped[campo]) !== String(huesped[campo]).trim().toUpperCase()) {
      throw invalido(campo, "Elegí un país de la lista.");
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(huesped.fechaNacimiento) || huesped.fechaNacimiento > fechaDesde) {
    throw invalido("fechaNacimiento", "La fecha de nacimiento no es válida.");
  }
  if (edadEn(huesped.fechaNacimiento, fechaDesde) < EDAD_MINIMA_TITULAR) {
    throw invalido("fechaNacimiento", `El titular tiene que tener al menos ${EDAD_MINIMA_TITULAR} años en la fecha de ingreso.`);
  }
  if (!esEmail(huesped.email)) throw invalido("email", "Ingresá un email válido.");
  const telefono = String(huesped.telefono).trim();
  if (!PATRON_TELEFONO.test(telefono) || !/\d/.test(telefono)) {
    throw invalido("telefono", "Ingresá un teléfono válido (números, espacios, +, - o paréntesis).");
  }
}

// Tarjeta: forma (400) y vencimiento (402 si ya venció, 422 si vence antes de la salida).
function validarTarjeta(tarjeta, fechaHasta) {
  const invalido = (campo, mensaje) => error(400, CODIGO_ERROR.DATOS_INVALIDOS, mensaje, { campo: `tarjeta.${campo}` });
  if (!String(tarjeta.titular ?? "").trim()) throw invalido("titular", "Completá el nombre del titular de la tarjeta.");
  const numero = String(tarjeta.numero ?? "").replace(/\s+/g, "");
  if (!/^\d{13,19}$/.test(numero) || !pasaLuhn(numero)) throw invalido("numero", "El número de tarjeta no es válido.");
  const mes = Number(tarjeta.vencimientoMes);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw invalido("vencimientoMes", "El mes de vencimiento no es válido.");
  if (!/^\d{4}$/.test(String(tarjeta.vencimientoAnio ?? ""))) throw invalido("vencimientoAnio", "El año de vencimiento no es válido.");
  if (!/^\d{3,4}$/.test(String(tarjeta.cvv ?? ""))) throw invalido("cvv", "El código de seguridad no es válido.");
  const finDeMes = new Date(Date.UTC(Number(tarjeta.vencimientoAnio), mes, 0)).toISOString().slice(0, 10);
  if (finDeMes < hoyISO()) throw error(402, CODIGO_ERROR.PAGO_RECHAZADO, "Pago rechazado.", { motivo: "Tarjeta vencida" });
  if (finDeMes < fechaHasta) throw error(422, CODIGO_ERROR.TARJETA_VENCE_ANTES, "La tarjeta vence antes de la salida.");
  return numero;
}

async function conEscenarioGeneral(funcion) {
  await demora();
  const escenario = escenarioActual();
  if (escenario === "ERROR_INTERNO") throw error(500, CODIGO_ERROR.ERROR_INTERNO, "Error interno del servidor.");
  if (escenario === "DEMASIADOS_INTENTOS")
    throw error(429, CODIGO_ERROR.DEMASIADOS_INTENTOS, "Demasiados intentos. Esperá unos minutos.");
  return funcion(escenario);
}

// --- Endpoints ---------------------------------------------------------------

export function mockObtenerTipos() {
  return conEscenarioGeneral(() => ({
    tipos: TIPOS.map(({ tipoHabitacionId, nombre, capacidadMaxima }) => ({ tipoHabitacionId, nombre, capacidadMaxima })),
  }));
}

// Etapa 2: misma forma que GET /api/web/planes.
export function mockObtenerPlanes() {
  return conEscenarioGeneral(() => ({
    planes: PLANES.map(({ planTarifarioId, codigo, nombre, reembolsable, horasCancelacionSinCargo, penalidadNoShow }) => ({
      planTarifarioId,
      codigo,
      nombre,
      reembolsable,
      horasCancelacionSinCargo,
      penalidadNoShow,
    })),
  }));
}

export function mockConsultarDisponibilidad({ fechaDesde, fechaHasta, adultos, menores = 0 }) {
  return conEscenarioGeneral((escenario) => {
    const noches = validarFechas(fechaDesde, fechaHasta);
    const personas = Number(adultos) + Number(menores);
    return {
      fechaDesde,
      fechaHasta,
      noches,
      tipos: TIPOS.map((tipo) => {
        const base = {
          tipoHabitacionId: tipo.tipoHabitacionId,
          nombre: tipo.nombre,
          capacidadMaxima: tipo.capacidadMaxima,
          ultimasDisponibles: tipo.ultimasDisponibles,
        };
        // Misma prioridad que el backend: (a) la ocupación supera la
        // capacidad del tipo; (b) no queda ninguna habitación libre que alcance.
        let motivoNoDisponible = null;
        if (personas > tipo.capacidadMaxima) {
          motivoNoDisponible = `Admite hasta ${tipo.capacidadMaxima} personas`;
        } else if (escenario === "SIN_DISPONIBILIDAD" && tipo.nombre === "Simple") {
          motivoNoDisponible = "Sin disponibilidad para estas fechas";
        }
        if (motivoNoDisponible) {
          return { ...base, ultimasDisponibles: false, desdePorNoche: null, planes: [], motivoNoDisponible };
        }
        const planes = PLANES.map((plan) => planConPrecio(tipo, plan, noches));
        return {
          ...base,
          desdePorNoche: Math.min(...planes.map((p) => p.promedioPorNoche)),
          planes,
          motivoNoDisponible: null,
        };
      }),
    };
  });
}

export function mockCotizar(cuerpo) {
  return conEscenarioGeneral(() => {
    const { noches, plan, lineas, total } = cotizacionInterna(cuerpo);
    const { descuento: _d, ...planPublico } = plan;
    return {
      total,
      promedioPorNoche: redondear(total / noches),
      noches,
      plan: { ...planPublico, total, promedioPorNoche: redondear(total / noches) },
      habitaciones: lineas,
    };
  });
}

// Mismo orden que el backend (CONTRATO.md → POST /api/web/reservas):
// validación completa → idempotencia → disponibilidad y precio → pasarela.
export function mockCrearReserva(cuerpo) {
  return conEscenarioGeneral((escenario) => {
    const clave = String(cuerpo?.claveIdempotencia ?? "");
    if (clave.length < CLAVE_IDEMPOTENCIA_MIN || clave.length > CLAVE_IDEMPOTENCIA_MAX || !PATRON_CLAVE.test(clave)) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Falta la clave del pedido o no es válida.", { campo: "claveIdempotencia" });
    }

    // 1. Validación completa (sin "base" ni pasarela).
    const { noches, plan, lineas, total } = cotizacionInterna(cuerpo);
    const { huesped = {}, consentimiento = {}, tarjeta = {}, llegada = {} } = cuerpo;
    if (!(Number(cuerpo.totalEsperado) > 0)) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Falta el total de la reserva.", { campo: "totalEsperado" });
    }
    validarHuesped(huesped, cuerpo.fechaDesde);
    if (llegada.horaEstimada != null && !HORAS_LLEGADA.some((h) => h.valor === llegada.horaEstimada)) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Elegí una hora estimada de llegada de la lista.", { campo: "llegada.horaEstimada" });
    }
    if (String(cuerpo.solicitudesEspeciales ?? "").length > MAX_SOLICITUDES) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, `Las solicitudes pueden tener hasta ${MAX_SOLICITUDES} caracteres.`, {
        campo: "solicitudesEspeciales",
      });
    }
    if (consentimiento.aceptaPoliticas !== true || consentimiento.versionPoliticas !== VERSION_POLITICAS) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Tenés que aceptar los términos y las políticas.", {
        campo: "consentimiento.aceptaPoliticas",
      });
    }
    const numero = validarTarjeta(tarjeta, cuerpo.fechaHasta);

    // 2. Idempotencia: misma clave + mismos datos (sin tarjeta) → la misma
    // reserva (200), con la garantía guardada y email.enviado = null.
    const previa = estado.reservasPorClave.get(clave);
    if (previa) {
      if (previa.firma !== firma(cuerpo)) {
        throw error(409, CODIGO_ERROR.CLAVE_REUTILIZADA, "La clave ya se usó con otros datos.");
      }
      return { ...structuredClone(previa.respuesta), email: { enviado: null } };
    }
    if (escenario === "CLAVE_REUTILIZADA" && !estado.claveReutilizadaDisparada) {
      estado.claveReutilizadaDisparada = true;
      throw error(409, CODIGO_ERROR.CLAVE_REUTILIZADA, "La clave ya se usó con otros datos.");
    }

    // 3. Disponibilidad y precio (sin tocar la pasarela).
    if (escenario === "SIN_DISPONIBILIDAD") {
      throw error(409, CODIGO_ERROR.SIN_DISPONIBILIDAD, "Ya no hay disponibilidad para esta selección.");
    }
    const totalFinal = escenario === "PRECIO_CAMBIADO" ? redondear(total * 1.1) : total;
    if (Number(cuerpo.totalEsperado) !== totalFinal) {
      throw error(409, CODIGO_ERROR.PRECIO_CAMBIADO, "El precio cambió.", { totalNuevo: totalFinal });
    }

    // 4. Pasarela: garantía (flexible) o preautorización (no reembolsable).
    if (numero.endsWith("0069")) throw error(402, CODIGO_ERROR.PAGO_RECHAZADO, "Pago rechazado.", { motivo: "Tarjeta vencida" });
    if (!plan.reembolsable && numero.endsWith("0002")) {
      throw error(402, CODIGO_ERROR.PAGO_RECHAZADO, "Pago rechazado.", { motivo: "Fondos insuficientes" });
    }

    const respuesta = {
      codigoConfirmacion: generarCodigo(),
      estado: "Confirmada",
      fechaDesde: cuerpo.fechaDesde,
      fechaHasta: cuerpo.fechaHasta,
      noches,
      plan: {
        codigo: plan.codigo,
        nombre: plan.nombre,
        reembolsable: plan.reembolsable,
        horasCancelacionSinCargo: plan.horasCancelacionSinCargo,
      },
      total: totalFinal,
      cobradoAhora: plan.reembolsable ? 0 : totalFinal,
      garantia: { tipo: plan.reembolsable ? "GARANTIA" : "PREPAGO", marca: marcaDe(numero), ultimos4: numero.slice(-4) },
      habitaciones: lineas.map(({ tipo, adultos, menores }) => ({ tipo, adultos, menores })),
      email: { enviado: true },
    };
    // La clave se consume solo cuando la reserva se crea.
    estado.reservasPorClave.set(clave, { firma: firma(cuerpo), respuesta });
    return respuesta;
  });
}

// Decisión 6: el email se compara con DatosReservaWeb.emailContacto (reserva
// web) o, en una reserva del mostrador, con Huesped.contacto solo si es un
// email. Sin email con qué comparar → NO_ENCONTRADA. Mismo mensaje siempre:
// no se revela si el código existe.
const MENSAJE_NO_ENCONTRADA =
  "No encontramos una reserva con esos datos. Revisá el código y el email, o contactá a recepción.";

function buscarReserva({ codigo, email }) {
  // Misma normalización que el backend: código sin espacios ni guiones, en
  // mayúsculas; email sin espacios, en minúsculas.
  const buscado = String(codigo ?? "").replace(/[\s-]/g, "").toUpperCase();
  const emailBuscado = String(email ?? "").replace(/\s/g, "").toLowerCase();
  const registro = RESERVAS_MI_RESERVA.find((r) => r.codigo === buscado);
  const emailReserva = registro ? (registro.emailWeb ?? (esEmail(registro.contacto) ? registro.contacto : null)) : null;
  if (!emailReserva || !emailBuscado || emailReserva.toLowerCase() !== emailBuscado) {
    throw error(404, CODIGO_ERROR.NO_ENCONTRADA, MENSAJE_NO_ENCONTRADA);
  }
  return registro;
}

export function mockConsultarMiReserva(cuerpo) {
  return conEscenarioGeneral(() => {
    const { codigo, reserva } = buscarReserva(cuerpo);
    if (estado.canceladas.has(codigo)) {
      return {
        ...structuredClone(reserva),
        estado: "Cancelada",
        cancelacion: { puedeCancelarOnline: false, motivo: MOTIVO_CANCELADA, penalidad: null },
      };
    }
    return structuredClone(reserva);
  });
}

export function mockCancelarMiReserva(cuerpo) {
  return conEscenarioGeneral(() => {
    const { codigo, reserva } = buscarReserva(cuerpo);
    // Idempotente: ya cancelada → misma respuesta, sin otro email.
    if (estado.canceladas.has(codigo)) return { estado: "Cancelada", penalidadCobrada: 0 };
    const { puedeCancelarOnline, motivo, penalidad } = reserva.cancelacion;
    if (!puedeCancelarOnline) {
      throw error(409, CODIGO_ERROR.PENALIDAD_CAMBIO, motivo, { montoNuevo: penalidad?.monto ?? 0, motivo });
    }
    // Online solo se cancela sin cargo: el monto aceptado tiene que ser 0.
    const aceptado = cuerpo?.montoPenalidadAceptado;
    if (aceptado === null || aceptado === "" || Number(aceptado) !== 0) {
      throw error(409, CODIGO_ERROR.PENALIDAD_CAMBIO, "El cargo por cancelar cambió.", { montoNuevo: 0, motivo: null });
    }
    estado.canceladas.add(codigo);
    return { estado: "Cancelada", penalidadCobrada: 0, email: { enviado: true } };
  });
}
