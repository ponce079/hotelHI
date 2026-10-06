// Pasarela de tarjetas SIMULADA. Una sola pieza para mostrador y e-commerce.
//
// Contrato (acordado con el equipo de tarifas / e-commerce):
//
//   procesarTarjeta({ operacion, monto, tarjeta, referenciaPrevia, claveIdempotencia })
//     operacion: GARANTIA | COBRO | PREAUTORIZACION | CAPTURA | LIBERACION
//     → { aprobado, referencia, token, marca, ultimos4, motivoRechazo }
//
// Reglas que NO se negocian:
//  - El número completo y el CVV se validan y se descartan: nunca se
//    persisten, nunca se devuelven y nunca se escriben en logs.
//  - La llamada a la pasarela NUNCA va dentro de una transacción de base de
//    datos (es una llamada de red lenta; el doc de timeouts lo prohíbe).
//  - Tarjetas de prueba: terminación 0002 → fondos insuficientes; 0069 →
//    vencida; el resto que pase Luhn y no esté vencido → aprobado.
//
// Extensión del contrato (a confirmar con Gimena): para operar sobre una
// tarjeta ya guardada (cobrar una penalidad meses después de reservar) no se
// tiene el número, solo el token. COBRO y PREAUTORIZACION aceptan entonces
// `referenciaPrevia` = token de una GARANTIA previa, en lugar de `tarjeta`.
//
// Idempotencia: la misma `claveIdempotencia` con la misma operación devuelve
// el resultado ya calculado en vez de procesar otra vez (un doble clic o un
// reintento de red no cobra dos veces). La caché es en memoria: sirve para
// reintentos cercanos; una pasarela real la persistiría.

const crypto = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { hoyComoFechaUTC } = require("../../lib/fechas");
const { leerSecreto } = require("./pasarelaSecreto");
const {
  OPERACIONES_TARJETA,
  OPERACION_TARJETA,
  FINAL_TARJETA_FONDOS,
  FINAL_TARJETA_VENCIDA,
} = require("./garantias.constantes");

// "Bóveda" simulada: el token es autodescriptivo y está firmado, así la
// pasarela no necesita base de datos y nadie puede fabricar uno a mano. NO
// contiene el número (solo marca, últimos 4 y vencimiento).
// El secreto sale de PASARELA_TOKEN_SECRETO (ver pasarelaSecreto.js: obligatorio en producción).
let secretoToken = null;
function secreto() {
  if (secretoToken === null) secretoToken = leerSecreto();
  return secretoToken;
}
const MAX_CLAVES_IDEMPOTENCIA = 1000;
const cacheIdempotencia = new Map();

class ErrorPasarela extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.statusCode = 400;
  }
}

function soloDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

// Algoritmo de Luhn: el mismo control de tipeo que ya hace el frontend.
function luhnValido(digitos) {
  if (!/^\d{13,19}$/.test(digitos)) return false;
  let suma = 0;
  let doble = false;
  for (let i = digitos.length - 1; i >= 0; i -= 1) {
    let n = Number(digitos[i]);
    if (doble) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
    doble = !doble;
  }
  return suma % 10 === 0;
}

function marcaDe(digitos) {
  if (/^4/.test(digitos)) return "Visa";
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(digitos)) return "Mastercard";
  if (/^3[47]/.test(digitos)) return "American Express";
  return "Tarjeta";
}

// El vencimiento llega como { vencimientoMes, vencimientoAnio } (anio de 2 o
// 4 dígitos). Una tarjeta vence el ÚLTIMO día de su mes.
function normalizarVencimiento(mes, anio) {
  const m = Number(mes);
  let a = Number(anio);
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(a) || a < 0) return null;
  if (a < 100) a += 2000;
  return { mes: m, anio: a };
}

function ultimoDiaDelMes({ mes, anio }) {
  return new Date(Date.UTC(anio, mes, 0)); // día 0 del mes siguiente
}

function vencida(venc) {
  return ultimoDiaDelMes(venc) < hoyComoFechaUTC();
}

function firmar(cuerpo) {
  return crypto.createHmac("sha256", secreto()).update(cuerpo).digest("base64url").slice(0, 22);
}

function emitirToken({ marca, ultimos4, mes, anio }) {
  const cuerpo = Buffer.from(JSON.stringify({ m: marca, u: ultimos4, v: [mes, anio], n: crypto.randomBytes(6).toString("hex") })).toString("base64url");
  return `tok_${cuerpo}.${firmar(cuerpo)}`;
}

// Devuelve { marca, ultimos4, mes, anio } o null si el token es inválido.
function leerToken(token) {
  const m = /^tok_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(token ?? ""));
  if (!m || firmar(m[1]) !== m[2]) return null;
  try {
    const d = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
    return { marca: d.m, ultimos4: d.u, mes: d.v[0], anio: d.v[1] };
  } catch {
    return null;
  }
}

function referenciaNueva(prefijo) {
  return `${prefijo}-${String(crypto.randomInt(0, 1000000)).padStart(6, "0")}`;
}

function rechazo(motivoRechazo, extra = {}) {
  return { aprobado: false, referencia: null, token: null, marca: null, ultimos4: null, motivoRechazo, ...extra };
}

function aprobacion(prefijo, datos = {}) {
  return {
    aprobado: true,
    referencia: referenciaNueva(prefijo),
    token: null,
    marca: null,
    ultimos4: null,
    motivoRechazo: null,
    ...datos,
  };
}

// Valida y resume una tarjeta nueva. Devuelve { ok, motivo } o los datos
// seguros ya derivados (nunca el número ni el CVV).
function evaluarTarjeta(tarjeta) {
  if (!tarjeta || typeof tarjeta !== "object") return { ok: false, motivo: "Falta la tarjeta." };
  const digitos = soloDigitos(tarjeta.numero);
  if (!luhnValido(digitos)) return { ok: false, motivo: "Número de tarjeta inválido." };
  if (!String(tarjeta.titular ?? "").trim()) return { ok: false, motivo: "Falta el titular de la tarjeta." };
  if (!/^\d{3,4}$/.test(String(tarjeta.cvv ?? ""))) return { ok: false, motivo: "Código de seguridad inválido." };
  const venc = normalizarVencimiento(tarjeta.vencimientoMes, tarjeta.vencimientoAnio);
  if (!venc) return { ok: false, motivo: "Vencimiento inválido (MM/AA)." };
  const ultimos4 = digitos.slice(-4);
  return { ok: true, marca: marcaDe(digitos), ultimos4, venc };
}

function simularResultadoDe({ ultimos4, venc }) {
  if (ultimos4 === FINAL_TARJETA_VENCIDA || vencida(venc)) return "Tarjeta vencida.";
  if (ultimos4 === FINAL_TARJETA_FONDOS) return "Fondos insuficientes.";
  return null;
}

function aMonto(monto) {
  try {
    const d = new Prisma.Decimal(monto ?? 0);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

async function procesar({ operacion, monto, tarjeta, referenciaPrevia }) {
  const importe = aMonto(monto);
  if (importe === null || importe.isNegative()) throw new ErrorPasarela("monto inválido.");

  switch (operacion) {
    case OPERACION_TARJETA.GARANTIA: {
      // Tokeniza la tarjeta sin retener ni cobrar nada.
      const t = evaluarTarjeta(tarjeta);
      if (!t.ok) return rechazo(t.motivo);
      const motivo = simularResultadoDe(t);
      if (motivo) return rechazo(motivo, { marca: t.marca, ultimos4: t.ultimos4 });
      return aprobacion("GAR", {
        token: emitirToken({ marca: t.marca, ultimos4: t.ultimos4, mes: t.venc.mes, anio: t.venc.anio }),
        marca: t.marca,
        ultimos4: t.ultimos4,
      });
    }

    case OPERACION_TARJETA.COBRO:
    case OPERACION_TARJETA.PREAUTORIZACION: {
      if (!importe.greaterThan(0)) throw new ErrorPasarela("El monto tiene que ser mayor a cero.");
      let datos;
      if (tarjeta) {
        const t = evaluarTarjeta(tarjeta);
        if (!t.ok) return rechazo(t.motivo);
        datos = t;
      } else {
        // Tarjeta guardada: referenciaPrevia es el token de una GARANTIA.
        const guardada = leerToken(referenciaPrevia);
        if (!guardada) throw new ErrorPasarela("Falta la tarjeta o un token de tarjeta válido en referenciaPrevia.");
        datos = { marca: guardada.marca, ultimos4: guardada.ultimos4, venc: { mes: guardada.mes, anio: guardada.anio } };
      }
      const motivo = simularResultadoDe(datos);
      const base = { marca: datos.marca, ultimos4: datos.ultimos4 };
      if (motivo) return rechazo(motivo, base);
      const prefijo = operacion === OPERACION_TARJETA.COBRO ? "COB" : "PRE";
      return aprobacion(prefijo, {
        ...base,
        // Al operar con una tarjeta nueva se devuelve también su token, así
        // quien cobra puede guardarla sin una segunda llamada.
        token: tarjeta
          ? emitirToken({ marca: datos.marca, ultimos4: datos.ultimos4, mes: datos.venc.mes, anio: datos.venc.anio })
          : referenciaPrevia,
      });
    }

    case OPERACION_TARJETA.CAPTURA:
    case OPERACION_TARJETA.LIBERACION: {
      // Operan sobre la referencia de una PREAUTORIZACION previa. El estado
      // (pendiente/capturada/liberada) lo lleva la base de datos del sistema,
      // no esta pasarela simulada.
      if (!/^PRE-\d{6}$/.test(String(referenciaPrevia ?? ""))) {
        throw new ErrorPasarela("referenciaPrevia debe ser la referencia de una preautorización.");
      }
      if (operacion === OPERACION_TARJETA.CAPTURA && !importe.greaterThan(0)) {
        throw new ErrorPasarela("El monto a capturar tiene que ser mayor a cero.");
      }
      return aprobacion(operacion === OPERACION_TARJETA.CAPTURA ? "CAP" : "LIB");
    }

    default:
      throw new ErrorPasarela(`operacion inválida. Valores permitidos: ${OPERACIONES_TARJETA.join(", ")}.`);
  }
}

async function procesarTarjeta({ operacion, monto, tarjeta, referenciaPrevia, claveIdempotencia } = {}) {
  const clave = claveIdempotencia ? `${operacion}:${claveIdempotencia}` : null;
  if (clave && cacheIdempotencia.has(clave)) return cacheIdempotencia.get(clave);

  const resultado = await procesar({ operacion, monto, tarjeta, referenciaPrevia });

  if (clave) {
    if (cacheIdempotencia.size >= MAX_CLAVES_IDEMPOTENCIA) {
      cacheIdempotencia.delete(cacheIdempotencia.keys().next().value);
    }
    cacheIdempotencia.set(clave, resultado);
  }
  return resultado;
}

module.exports = {
  procesarTarjeta,
  ErrorPasarela,
  // Para los tests y para validar la tarjeta antes de llamar a la pasarela.
  luhnValido,
  normalizarVencimiento,
  ultimoDiaDelMes,
  leerToken,
};
