// PASARELA DE PAGO SIMULADA del e-commerce (HU-102).
//
// Es el ÚNICO punto que se reemplaza por el módulo de garantías de Ricardo,
// con la firma real que él confirme. La firma acordada (CONTRATO.md):
//
//   procesarTarjeta({ operacion, monto, tarjeta, referenciaPrevia, claveIdempotencia })
//     → { aprobado, referencia, token, marca, ultimos4, motivoRechazo }
//
//   operacion: GARANTIA (monto 0: valida la tarjeta y devuelve un token),
//              PREAUTORIZACION (bloquea el monto), CAPTURA y LIBERACION
//              (sobre referenciaPrevia), COBRO (reservada).
//
// Tarjetas de prueba: terminada en 0069 → rechaza todo ("Tarjeta vencida");
// terminada en 0002 → rechaza PREAUTORIZACION y COBRO ("Fondos
// insuficientes") pero acepta GARANTIA (una validación de monto 0 no mira el
// saldo); el resto, válidas por Luhn, se aprueban.
//
// No persiste nada (todo vive en memoria del proceso), no usa prisma ni tx y
// no loguea ni devuelve el número ni el CVV: solo marca y últimos 4.
const crypto = require("node:crypto");

const OPERACION = {
  GARANTIA: "GARANTIA",
  PREAUTORIZACION: "PREAUTORIZACION",
  CAPTURA: "CAPTURA",
  LIBERACION: "LIBERACION",
  COBRO: "COBRO",
};

const MOTIVO = {
  VENCIDA: "Tarjeta vencida",
  FONDOS: "Fondos insuficientes",
  INVALIDA: "Tarjeta inválida",
  REFERENCIA: "Operación inexistente o ya resuelta",
  CAPTURA_FORZADA: "No se pudo capturar el pago",
};

// Estado en memoria: resultados por (clave, operación) y preautorizaciones.
const resultados = new Map();
const preautorizaciones = new Map(); // referencia → { monto, estado: pendiente | capturada | liberada }
let fallarProximaCaptura = false;

function digitos(numero) {
  return String(numero ?? "").replace(/\D/g, "");
}

function pasaLuhn(numero) {
  const d = digitos(numero);
  if (!/^\d{13,19}$/.test(d)) return false;
  let suma = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
  }
  return suma % 10 === 0;
}

function marcaDe(numero) {
  const d = digitos(numero);
  if (/^4/.test(d)) return "VISA";
  const dos = Number(d.slice(0, 2));
  const cuatro = Number(d.slice(0, 4));
  if ((dos >= 51 && dos <= 55) || (cuatro >= 2221 && cuatro <= 2720)) return "MASTERCARD";
  if (/^3[47]/.test(d)) return "AMEX";
  return "OTRA";
}

const nuevaReferencia = (prefijo) => `${prefijo}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

function rechazo(motivoRechazo, tarjeta) {
  return {
    aprobado: false,
    referencia: null,
    token: null,
    marca: tarjeta ? marcaDe(tarjeta.numero) : null,
    ultimos4: tarjeta ? digitos(tarjeta.numero).slice(-4) : null,
    motivoRechazo,
  };
}

function operarConTarjeta(operacion, monto, tarjeta) {
  const numero = digitos(tarjeta?.numero);
  if (!pasaLuhn(numero)) return rechazo(MOTIVO.INVALIDA, tarjeta);
  if (numero.endsWith("0069")) return rechazo(MOTIVO.VENCIDA, tarjeta);
  if (numero.endsWith("0002") && operacion !== OPERACION.GARANTIA) return rechazo(MOTIVO.FONDOS, tarjeta);

  const base = { aprobado: true, token: null, marca: marcaDe(numero), ultimos4: numero.slice(-4), motivoRechazo: null };
  if (operacion === OPERACION.GARANTIA) return { ...base, referencia: nuevaReferencia("GAR"), token: nuevaReferencia("TOK") };
  if (operacion === OPERACION.PREAUTORIZACION) {
    const referencia = nuevaReferencia("PRE");
    preautorizaciones.set(referencia, { monto: String(monto), estado: "pendiente" });
    return { ...base, referencia };
  }
  return { ...base, referencia: nuevaReferencia("COB") };
}

function operarSobrePrevia(operacion, referenciaPrevia) {
  const previa = preautorizaciones.get(referenciaPrevia);
  if (!previa || previa.estado !== "pendiente") return rechazo(MOTIVO.REFERENCIA, null);
  if (operacion === OPERACION.CAPTURA && fallarProximaCaptura) {
    fallarProximaCaptura = false;
    return rechazo(MOTIVO.CAPTURA_FORZADA, null);
  }
  previa.estado = operacion === OPERACION.CAPTURA ? "capturada" : "liberada";
  return { aprobado: true, referencia: referenciaPrevia, token: null, marca: null, ultimos4: null, motivoRechazo: null };
}

async function procesarTarjeta({ operacion, monto, tarjeta, referenciaPrevia, claveIdempotencia } = {}) {
  if (!Object.values(OPERACION).includes(operacion)) throw new Error(`Operación de pasarela desconocida: ${operacion}`);
  // Idempotente por (claveIdempotencia, operacion): repetir devuelve lo mismo.
  const clave = claveIdempotencia ? `${claveIdempotencia}|${operacion}|${referenciaPrevia ?? ""}` : null;
  if (clave && resultados.has(clave)) return { ...resultados.get(clave) };

  const resultado =
    operacion === OPERACION.CAPTURA || operacion === OPERACION.LIBERACION
      ? operarSobrePrevia(operacion, referenciaPrevia)
      : operarConTarjeta(operacion, monto, tarjeta);
  if (clave) resultados.set(clave, resultado);
  return { ...resultado };
}

// Solo para tests: no se usa en el flujo real.
const _soloTest = {
  forzarFallaDeCaptura() {
    fallarProximaCaptura = true;
  },
  estadoPreautorizacion(referencia) {
    return preautorizaciones.get(referencia)?.estado ?? null;
  },
  reiniciar() {
    resultados.clear();
    preautorizaciones.clear();
    fallarProximaCaptura = false;
  },
};

module.exports = { OPERACION, MOTIVO, procesarTarjeta, pasaLuhn, marcaDe, _soloTest };
