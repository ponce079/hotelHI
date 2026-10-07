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
// Registro persistente (tabla pasarela_operaciones, ver pasarelaRegistro.js): como un proveedor real, la
// pasarela guarda cada operación.
//  - Idempotencia: la misma `claveIdempotencia` con la misma operación devuelve el resultado ya guardado en
//    vez de procesar otra vez (un doble clic, un reintento de red o un reinicio del backend no cobran dos
//    veces).
//  - Estado de las preautorizaciones: Vigente -> Capturada (con el monto capturado) | Liberada. CAPTURA y
//    LIBERACION exigen una PREAUTORIZACION existente y aprobada. Una captura no puede superar lo retenido; una
//    segunda captura o liberación se rechaza; una captura PARCIAL libera el remanente sola y deja la
//    preautorización en el estado final "Capturada, remanente liberado" (una LIBERACION posterior se rechaza:
//    "La preautorización ya fue cerrada.").
//  - Si el registro no se puede escribir, la operación se informa como error de la pasarela (nunca se aprueba
//    en silencio).

const crypto = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { hoyComoFechaUTC } = require("../../lib/fechas");
const { leerSecreto } = require("./pasarelaSecreto");
const registro = require("./pasarelaRegistro");
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

// Estados de una preautorización en el registro (columna estadoPreautorizacion).
const ESTADO_PREAUTORIZACION = {
  VIGENTE: "Vigente",
  CAPTURADA: "Capturada",
  REMANENTE_LIBERADO: "Capturada, remanente liberado",
  LIBERADA: "Liberada",
};

class ErrorPasarela extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
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

// Prefijo de la referencia de cada operación aprobada.
const PREFIJO = { GARANTIA: "GAR", COBRO: "COB", PREAUTORIZACION: "PRE", CAPTURA: "CAP", LIBERACION: "LIB" };

// Lo que se guarda de una operación (sin la clave ni la referencia, que se completan al registrar).
function datosDeRegistro({ operacion, importe, referenciaPrevia, resultado }) {
  return {
    operacion,
    referenciaPrevia: referenciaPrevia ? String(referenciaPrevia).slice(0, 255) : null,
    // Como texto con dos decimales: Prisma lo acepta para un Decimal(12,2) y no hay que clonar un Decimal.
    monto: importe.toFixed(2),
    aprobada: resultado.aprobado,
    motivo: resultado.motivoRechazo ? String(resultado.motivoRechazo).slice(0, 191) : null,
    marca: resultado.marca ?? null,
    ultimos4: resultado.ultimos4 ?? null,
    token: resultado.token ?? null,
    estadoPreautorizacion: operacion === "PREAUTORIZACION" && resultado.aprobado ? ESTADO_PREAUTORIZACION.VIGENTE : null,
  };
}

function aResultado(fila) {
  return {
    aprobado: Boolean(fila.aprobada),
    referencia: fila.referencia ?? null,
    token: fila.token ?? null,
    marca: fila.marca ?? null,
    ultimos4: fila.ultimos4 ?? null,
    motivoRechazo: fila.motivo ?? null,
  };
}

// Qué pasa con una preautorización según su estado (puro). Devuelve { motivo } si se rechaza o
// { hasta, montoCapturado? } con la transición.
function decidirSobrePreautorizacion(operacion, pre, importe) {
  const retenido = new Prisma.Decimal(pre.monto);
  const capturado = pre.montoCapturado === null || pre.montoCapturado === undefined ? retenido : new Prisma.Decimal(pre.montoCapturado);
  const estado = pre.estadoPreautorizacion;

  if (operacion === OPERACION_TARJETA.CAPTURA) {
    if (estado === ESTADO_PREAUTORIZACION.LIBERADA) return { motivo: "La preautorización ya fue liberada." };
    if (estado !== ESTADO_PREAUTORIZACION.VIGENTE) return { motivo: "La preautorización ya fue capturada." };
    if (importe.greaterThan(retenido)) return { motivo: "El monto a capturar supera el monto preautorizado." };
    // Captura TOTAL → "Capturada". Captura PARCIAL → el remanente se libera solo, como en un proveedor real:
    // "Capturada, remanente liberado" (estado final).
    const hasta = importe.lessThan(retenido) ? ESTADO_PREAUTORIZACION.REMANENTE_LIBERADO : ESTADO_PREAUTORIZACION.CAPTURADA;
    return { hasta, montoCapturado: importe };
  }

  // LIBERACION
  if (estado === ESTADO_PREAUTORIZACION.VIGENTE) {
    if (importe.greaterThan(retenido)) return { motivo: "El monto a liberar supera lo retenido." };
    return { hasta: ESTADO_PREAUTORIZACION.LIBERADA };
  }
  if (estado === ESTADO_PREAUTORIZACION.CAPTURADA) {
    // Capturada por completo (no hay remanente). Una fila con captura parcial en "Capturada" es anterior a este
    // cierre automático: también está cerrada.
    if (capturado.lessThan(retenido)) return { motivo: "La preautorización ya fue cerrada." };
    return { motivo: "La preautorización se capturó por completo: no hay remanente que liberar." };
  }
  if (estado === ESTADO_PREAUTORIZACION.REMANENTE_LIBERADO) return { motivo: "La preautorización ya fue cerrada." };
  return { motivo: "La preautorización ya fue liberada." };
}

// Calcula el resultado de una operación. Devuelve { resultado, datos, transicion }: lo que se responde, lo que se
// registra y (solo CAPTURA y LIBERACION aprobadas) el cambio de estado de la preautorización.
async function procesar({ operacion, monto, tarjeta, referenciaPrevia }) {
  const importe = aMonto(monto);
  if (importe === null || importe.isNegative()) throw new ErrorPasarela("monto inválido.");
  const salida = (resultado, transicion = null) => ({
    resultado,
    datos: datosDeRegistro({ operacion, importe, referenciaPrevia, resultado }),
    transicion,
  });

  switch (operacion) {
    case OPERACION_TARJETA.GARANTIA: {
      // Tokeniza la tarjeta sin retener ni cobrar nada.
      const t = evaluarTarjeta(tarjeta);
      if (!t.ok) return salida(rechazo(t.motivo));
      const motivo = simularResultadoDe(t);
      if (motivo) return salida(rechazo(motivo, { marca: t.marca, ultimos4: t.ultimos4 }));
      return salida(
        aprobacion("GAR", {
          token: emitirToken({ marca: t.marca, ultimos4: t.ultimos4, mes: t.venc.mes, anio: t.venc.anio }),
          marca: t.marca,
          ultimos4: t.ultimos4,
        })
      );
    }

    case OPERACION_TARJETA.COBRO:
    case OPERACION_TARJETA.PREAUTORIZACION: {
      if (!importe.greaterThan(0)) throw new ErrorPasarela("El monto tiene que ser mayor a cero.");
      let datos;
      if (tarjeta) {
        const t = evaluarTarjeta(tarjeta);
        if (!t.ok) return salida(rechazo(t.motivo));
        datos = t;
      } else {
        // Tarjeta guardada: referenciaPrevia es el token de una GARANTIA.
        const guardada = leerToken(referenciaPrevia);
        if (!guardada) throw new ErrorPasarela("Falta la tarjeta o un token de tarjeta válido en referenciaPrevia.");
        datos = { marca: guardada.marca, ultimos4: guardada.ultimos4, venc: { mes: guardada.mes, anio: guardada.anio } };
      }
      const motivo = simularResultadoDe(datos);
      const base = { marca: datos.marca, ultimos4: datos.ultimos4 };
      if (motivo) return salida(rechazo(motivo, base));
      return salida(
        aprobacion(PREFIJO[operacion], {
          ...base,
          // Al operar con una tarjeta nueva se devuelve también su token, así
          // quien cobra puede guardarla sin una segunda llamada.
          token: tarjeta
            ? emitirToken({ marca: datos.marca, ultimos4: datos.ultimos4, mes: datos.venc.mes, anio: datos.venc.anio })
            : referenciaPrevia,
        })
      );
    }

    case OPERACION_TARJETA.CAPTURA:
    case OPERACION_TARJETA.LIBERACION: {
      // Operan sobre la referencia de una PREAUTORIZACION previa, que tiene que estar en el registro.
      if (!/^PRE-\d{6}$/.test(String(referenciaPrevia ?? ""))) {
        throw new ErrorPasarela("referenciaPrevia debe ser la referencia de una preautorización.");
      }
      if (operacion === OPERACION_TARJETA.CAPTURA && !importe.greaterThan(0)) {
        throw new ErrorPasarela("El monto a capturar tiene que ser mayor a cero.");
      }
      const pre = await registro.buscarPreautorizacion(referenciaPrevia);
      if (!pre) return salida(rechazo("Preautorización desconocida."));
      const decision = decidirSobrePreautorizacion(operacion, pre, importe);
      if (decision.motivo) return salida(rechazo(decision.motivo));
      return salida(aprobacion(PREFIJO[operacion]), {
        referencia: referenciaPrevia,
        desde: pre.estadoPreautorizacion,
        hasta: decision.hasta,
        ...(decision.montoCapturado !== undefined ? { montoCapturado: decision.montoCapturado.toFixed(2) } : {}),
      });
    }

    default:
      throw new ErrorPasarela(`operacion inválida. Valores permitidos: ${OPERACIONES_TARJETA.join(", ")}.`);
  }
}

const MAX_INTENTOS_REGISTRO = 5;

// Escribe el resultado en el registro. Devuelve { resultado } (lo que hay que responder: el propio o, si una
// llamada idéntica concurrente llegó primero, el guardado) o { reintentar: true } si la preautorización cambió de
// estado entre que se leyó y se escribió.
async function registrar({ clave, resultado, datos, transicion }) {
  let actual = resultado;
  for (let intento = 0; intento < MAX_INTENTOS_REGISTRO; intento += 1) {
    const fila = { ...datos, referencia: actual.referencia, claveIdempotencia: clave };
    const r = transicion ? await registro.transicionarYCrear(transicion, fila) : await registro.crear(fila);
    if (r.creada) return { resultado: actual };
    if (r.duplicado === "estado") return { reintentar: true };
    if (r.duplicado === "clave") {
      const previa = await registro.buscarPorClave(clave);
      if (previa) return { resultado: aResultado(previa) };
    }
    // Choque de referencia (6 dígitos al azar): se pide otra.
    if (r.duplicado === "referencia" && actual.referencia) {
      actual = { ...actual, referencia: referenciaNueva(actual.referencia.split("-")[0]) };
    }
  }
  throw new ErrorPasarela("No se pudo registrar la operación en la pasarela.", 502);
}

async function procesarTarjeta({ operacion, monto, tarjeta, referenciaPrevia, claveIdempotencia } = {}) {
  // Una misma clave puede usarse en operaciones distintas: la fila guarda "<OPERACION>:<clave>".
  const clave = claveIdempotencia ? `${operacion}:${claveIdempotencia}`.slice(0, 191) : null;
  try {
    if (clave) {
      const previa = await registro.buscarPorClave(clave);
      if (previa) return aResultado(previa);
    }
    for (let intento = 0; intento < 3; intento += 1) {
      const calculado = await procesar({ operacion, monto, tarjeta, referenciaPrevia });
      const guardado = await registrar({ clave, ...calculado });
      if (!guardado.reintentar) return guardado.resultado;
    }
    throw new ErrorPasarela("La preautorización cambió de estado mientras se procesaba la operación: reintentá.", 409);
  } catch (err) {
    if (err instanceof ErrorPasarela) throw err;
    // Un fallo del registro NUNCA se convierte en una aprobación: se informa como error de la pasarela.
    console.error("[pasarela] No se pudo usar el registro de operaciones:", err?.message);
    throw new ErrorPasarela("La pasarela no pudo registrar la operación: no se procesó nada. Reintentá en un momento.", 502);
  }
}

module.exports = {
  procesarTarjeta,
  ErrorPasarela,
  ESTADO_PREAUTORIZACION,
  decidirSobrePreautorizacion,
  // Para los tests y para validar la tarjeta antes de llamar a la pasarela.
  luhnValido,
  normalizarVencimiento,
  ultimoDiaDelMes,
  leerToken,
};
