// Mismos 5 medios que backend/src/modulos/pagos-estadia/pagoEstadia.constantes.js.
// A diferencia de Pagos a Proveedores, acá no hay Cheque (HU-50).
export const MEDIOS_PAGO_ESTADIA = ["Efectivo", "Tarjeta crédito", "Tarjeta débito", "Transferencia", "Online"];

// PagoEstadia.estado -> variante de <Badge>. Un pago anulado se muestra
// aparte (neutro), no con su estado original.
export const ESTADO_PAGO_BADGE = { Pagado: "ok", Parcial: "alerta" };

// De dónde salió el cobro (HU-88, sumado para Movimientos de Pago) — mismos
// 3 valores que backend/src/modulos/pagos-estadia/pagoEstadia.constantes.js.
// "Pago final" es el default: es lo que HU-50 siempre fue antes de este campo.
export const CONCEPTO_SENIA = "Seña";
export const CONCEPTO_GARANTIA = "Garantía";
export const CONCEPTO_PAGO_FINAL = "Pago final";
// Garantía con tarjeta (feature/garantia-tarjeta): mismos strings que el backend.
// "Seña" y "Garantía" quedan como conceptos HISTÓRICOS (ya no se crean filas
// nuevas, pero las existentes se siguen mostrando y filtrando). La Devolución
// se registra con importe NEGATIVO.
export const CONCEPTO_PAGO_ANTICIPADO = "Pago anticipado";
export const CONCEPTO_PENALIDAD_CANCELACION = "Penalidad por cancelación";
export const CONCEPTO_PENALIDAD_NO_SHOW = "Penalidad no-show";
export const CONCEPTO_DEVOLUCION = "Devolución";
export const CONCEPTOS_PAGO_ESTADIA = [
  CONCEPTO_SENIA,
  CONCEPTO_GARANTIA,
  CONCEPTO_PAGO_FINAL,
  CONCEPTO_PAGO_ANTICIPADO,
  CONCEPTO_PENALIDAD_CANCELACION,
  CONCEPTO_PENALIDAD_NO_SHOW,
  CONCEPTO_DEVOLUCION,
];

export const CONCEPTO_PAGO_BADGE = {
  [CONCEPTO_SENIA]: "info",
  [CONCEPTO_GARANTIA]: "alerta",
  [CONCEPTO_PAGO_FINAL]: "ok",
  [CONCEPTO_PAGO_ANTICIPADO]: "ok",
  [CONCEPTO_PENALIDAD_CANCELACION]: "error",
  [CONCEPTO_PENALIDAD_NO_SHOW]: "error",
  [CONCEPTO_DEVOLUCION]: "info",
};

// ---------------------------------------------------------------------------
// Tarjeta SIMULADA (no hay procesador real). Estos medios se cobran pasando
// por el panel de la terminal simulada antes de poder confirmar el pago.
// ---------------------------------------------------------------------------
export const MEDIOS_CON_TARJETA = ["Tarjeta crédito", "Tarjeta débito"];
export const CUOTAS_TARJETA_CREDITO = [1, 3, 6, 12];

// Una tarjeta que termina en estos 4 dígitos simula un rechazo (para poder
// mostrar el camino de error en una demo). Cualquier otra número válido se aprueba.
export const FINAL_TARJETA_RECHAZADA = "0002";
export const TARJETA_DE_PRUEBA = "4242 4242 4242 4242";

export const soloDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");

// "4242424242424242" -> "4242 4242 4242 4242" mientras se tipea.
export function formatearNumeroTarjeta(valor) {
  return soloDigitos(valor)
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

// "1228" -> "12/28" mientras se tipea.
export function formatearVencimiento(valor) {
  const d = soloDigitos(valor).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function marcaTarjeta(numero) {
  const d = soloDigitos(numero);
  if (/^4/.test(d)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "Amex";
  return "Tarjeta";
}

// Chequeo de Luhn: detecta un número mal tipeado igual que una terminal real.
export function luhnValido(numero) {
  const d = soloDigitos(numero);
  if (d.length < 13 || d.length > 19) return false;
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

// "MM/AA" con mes 01-12 y que no esté vencida (vale hasta fin de ese mes).
export function vencimientoVigente(texto, ahora = new Date()) {
  const m = /^(\d{2})\/(\d{2})$/.exec(texto);
  if (!m) return false;
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  if (mes < 1 || mes > 12) return false;
  return anio * 12 + mes >= ahora.getFullYear() * 12 + ahora.getMonth() + 1;
}

export const generarCodigoAutorizacion = () => String(Math.floor(100000 + Math.random() * 900000));
