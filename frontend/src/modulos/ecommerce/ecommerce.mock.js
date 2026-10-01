// Mock de /api/web — responde con la forma EXACTA de docs/ecommerce/CONTRATO.md.
// Se activa con VITE_ECOMMERCE_MOCK=true (frontend/.env.local). Solo Gimena
// lo cambia. Nunca muestra número de habitación, piso ni cantidad de libres.
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
// Tarjetas: 4242424242424242 aprobada; terminada en 0002 → fondos
// insuficientes; en 0069 → tarjeta vencida; sin Luhn → DATOS_INVALIDOS
// (tarjeta.numero); vencimiento anterior a la salida → TARJETA_VENCE_ANTES.
import {
  CLAVE_IDEMPOTENCIA_MAX,
  CLAVE_IDEMPOTENCIA_MIN,
  CODIGO_ERROR,
  MAX_HABITACIONES_WEB,
  MAX_SOLICITUDES,
  VERSION_POLITICAS,
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

const RESERVA_DEMO = {
  codigoConfirmacion: "DEMO1234",
  estado: "Confirmada",
  fechaDesde: "2026-11-20",
  fechaHasta: "2026-11-23",
  noches: 3,
  plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48 },
  total: 75000,
  cobrado: 0,
  habitaciones: [{ tipo: "Doble", adultos: 2, menores: 1 }],
  titular: "Juan P.",
  documento: "****222",
  puedeCancelar: true,
  penalidadCancelacion: {
    aplica: true,
    monto: 25000,
    mensaje: "Ya pasó el plazo de cancelación sin cargo: se cobra la primera noche.",
    limiteSinCargo: "2026-11-18T17:00:00.000Z",
  },
};

// Estado en memoria (se pierde al recargar, igual que un servidor reiniciado).
const estado = {
  reservasPorClave: new Map(), // clave → { huella, respuesta }
  claveReutilizadaDisparada: false,
  demoCancelada: false,
};

export function reiniciarMock() {
  estado.reservasPorClave.clear();
  estado.claveReutilizadaDisparada = false;
  estado.demoCancelada = false;
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
  if (/^5[1-5]/.test(numero)) return "MASTERCARD";
  if (/^3[47]/.test(numero)) return "AMEX";
  return "OTRA";
}

// Huella de los datos de la reserva SIN la tarjeta (idempotencia).
function huella({ tarjeta: _tarjeta, claveIdempotencia: _clave, ...resto }) {
  return JSON.stringify(resto);
}

function generarCodigo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 8; i++) codigo += letras[Math.floor(Math.random() * letras.length)];
  return codigo;
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
        let motivoNoDisponible = null;
        if (escenario === "SIN_DISPONIBILIDAD" && tipo.nombre === "Simple") {
          motivoNoDisponible = "Sin disponibilidad para estas fechas";
        } else if (personas > tipo.capacidadMaxima) {
          motivoNoDisponible = `Admite hasta ${tipo.capacidadMaxima} personas`;
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

export function mockCrearReserva(cuerpo) {
  return conEscenarioGeneral((escenario) => {
    const clave = String(cuerpo?.claveIdempotencia ?? "");
    if (clave.length < CLAVE_IDEMPOTENCIA_MIN || clave.length > CLAVE_IDEMPOTENCIA_MAX) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Falta la clave de idempotencia.", { campo: "claveIdempotencia" });
    }

    // Idempotencia: misma clave + mismos datos (sin tarjeta) → misma reserva (200).
    const previa = estado.reservasPorClave.get(clave);
    if (previa) {
      if (previa.huella !== huella(cuerpo)) {
        throw error(409, CODIGO_ERROR.CLAVE_REUTILIZADA, "La clave ya se usó con otros datos.");
      }
      return { ...previa.respuesta, garantia: null };
    }

    if (escenario === "CLAVE_REUTILIZADA" && !estado.claveReutilizadaDisparada) {
      estado.claveReutilizadaDisparada = true;
      throw error(409, CODIGO_ERROR.CLAVE_REUTILIZADA, "La clave ya se usó con otros datos.");
    }

    const { noches, plan, lineas, total } = cotizacionInterna(cuerpo);
    const { huesped = {}, consentimiento = {}, tarjeta = {} } = cuerpo;

    for (const campo of ["nombre", "apellido", "tipoDocumento", "numeroDocumento", "email", "telefono", "nacionalidad", "paisResidencia"]) {
      if (!String(huesped[campo] ?? "").trim()) {
        throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Completá todos los datos del titular.", { campo: `huesped.${campo}` });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(huesped.email)) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "Ingresá un email válido.", { campo: "huesped.email" });
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

    if (escenario === "SIN_DISPONIBILIDAD") {
      throw error(409, CODIGO_ERROR.SIN_DISPONIBILIDAD, "Ya no hay disponibilidad para esta selección.");
    }
    if (escenario === "PRECIO_CAMBIADO") {
      const totalNuevo = redondear(total * 1.1);
      if (Number(cuerpo.totalEsperado) !== totalNuevo) {
        throw error(409, CODIGO_ERROR.PRECIO_CAMBIADO, "El precio cambió.", { totalNuevo });
      }
    } else if (Number(cuerpo.totalEsperado) !== total) {
      throw error(409, CODIGO_ERROR.PRECIO_CAMBIADO, "El precio cambió.", { totalNuevo: total });
    }
    const totalFinal = escenario === "PRECIO_CAMBIADO" ? redondear(total * 1.1) : total;

    // Tarjeta (se valida y no se guarda).
    const numero = String(tarjeta.numero ?? "").replace(/\s+/g, "");
    if (!pasaLuhn(numero)) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "El número de tarjeta no es válido.", { campo: "tarjeta.numero" });
    }
    if (!/^\d{3,4}$/.test(String(tarjeta.cvv ?? ""))) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "El código de seguridad no es válido.", { campo: "tarjeta.cvv" });
    }
    const mes = Number(tarjeta.vencimientoMes);
    const anio = Number(tarjeta.vencimientoAnio);
    if (!(mes >= 1 && mes <= 12) || !(anio >= 2000)) {
      throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "El vencimiento no es válido.", { campo: "tarjeta.vencimiento" });
    }
    // Vence el último día del mes indicado; tiene que cubrir la salida.
    const finDeMes = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
    if (finDeMes < cuerpo.fechaHasta) {
      throw error(422, CODIGO_ERROR.TARJETA_VENCE_ANTES, "La tarjeta vence antes de la salida.");
    }
    if (numero.endsWith("0002")) throw error(402, CODIGO_ERROR.PAGO_RECHAZADO, "Pago rechazado.", { motivo: "Fondos insuficientes" });
    if (numero.endsWith("0069")) throw error(402, CODIGO_ERROR.PAGO_RECHAZADO, "Pago rechazado.", { motivo: "Tarjeta vencida" });

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
    estado.reservasPorClave.set(clave, { huella: huella(cuerpo), respuesta });
    return respuesta;
  });
}

function buscarDemo({ codigo, email }) {
  const coincide =
    String(codigo ?? "").trim().toUpperCase() === RESERVA_DEMO.codigoConfirmacion &&
    String(email ?? "").trim().toLowerCase() === "demo@hotel.com";
  // Mismo mensaje siempre: no se revela si el código existe.
  if (!coincide) throw error(404, CODIGO_ERROR.NO_ENCONTRADA, "No encontramos una reserva con esos datos.");
}

export function mockConsultarMiReserva(cuerpo) {
  return conEscenarioGeneral(() => {
    buscarDemo(cuerpo);
    if (estado.demoCancelada) {
      return { ...RESERVA_DEMO, estado: "Cancelada", puedeCancelar: false, penalidadCancelacion: null, cobrado: 25000 };
    }
    return structuredClone(RESERVA_DEMO);
  });
}

export function mockCancelarMiReserva(cuerpo) {
  return conEscenarioGeneral(() => {
    buscarDemo(cuerpo);
    if (estado.demoCancelada) throw error(400, CODIGO_ERROR.DATOS_INVALIDOS, "La reserva ya está cancelada.", { campo: "codigo" });
    const monto = RESERVA_DEMO.penalidadCancelacion.monto;
    if (Number(cuerpo.montoPenalidadAceptado) !== monto) {
      throw error(409, CODIGO_ERROR.PENALIDAD_CAMBIO, "El cargo por cancelar cambió.", { montoNuevo: monto });
    }
    estado.demoCancelada = true;
    return { estado: "Cancelada", penalidadCobrada: monto };
  });
}
