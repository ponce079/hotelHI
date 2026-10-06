// Garantía de la reserva (espejo de backend/src/modulos/garantias/).
//
// El número de tarjeta y el CVV viven SOLO en el estado del paso "Garantía":
// viajan una vez al backend (HTTPS) dentro de `garantia.tarjeta`, que los
// valida y los descarta. Nunca se guardan (ni en la base, ni en localStorage,
// ni en el estado global) y nunca se escriben en consola.

import {
  formatearNumeroTarjeta,
  formatearVencimiento,
  luhnValido,
  soloDigitos,
  TARJETA_DE_PRUEBA,
} from "../pagos-estadia/pagoEstadia.constantes";

export { formatearNumeroTarjeta, formatearVencimiento, soloDigitos, TARJETA_DE_PRUEBA };

export const TIPO_GARANTIA = { TARJETA: "TARJETA", PREPAGO: "PREPAGO" };

// Prepago (sin tarjeta de crédito): mismos strings que MEDIOS_PAGO_ESTADIA.
// Efectivo no: un prepago se hace antes de llegar.
export const MEDIOS_PREPAGO = ["Transferencia", "Tarjeta débito", "Online"];
export const MEDIO_PREPAGO_LABEL = {
  Transferencia: "Transferencia",
  "Tarjeta débito": "Tarjeta de débito",
  Online: "Mercado Pago (online)",
};

// Una tarjeta de prueba por cada camino de la pasarela simulada.
export const TARJETAS_DE_PRUEBA = {
  aprobada: "4242 4242 4242 4242",
  fondos: "4000 0000 0000 0002",
  vencida: "4000 0000 0000 0069",
};

export const GARANTIA_INICIAL = {
  tipo: TIPO_GARANTIA.TARJETA,
  tarjeta: { titular: "", numero: "", vencimiento: "", cvv: "" },
  medioPrepago: "",
  importePrepago: "",
  referenciaPrepago: "",
};

// "MM/AA" → { mes, anio } o null.
export function leerVencimiento(texto) {
  const m = /^(\d{2})\/(\d{2})$/.exec(texto ?? "");
  if (!m) return null;
  const mes = Number(m[1]);
  if (mes < 1 || mes > 12) return null;
  return { mes, anio: 2000 + Number(m[2]) };
}

// La tarjeta vence el ÚLTIMO día de su mes y tiene que cubrir hasta la salida
// (así sigue sirviendo para consumos y penalidades). Mismo criterio que el
// backend, que igual vuelve a validar. `fechaHasta` puede ser "AAAA-MM-DD" o un
// ISO completo (la reserva ya creada lo trae con hora).
export function vencimientoCubreSalida(texto, fechaHasta) {
  const v = leerVencimiento(texto);
  if (!v || !fechaHasta) return false;
  const ultimoDia = Date.UTC(v.anio, v.mes, 0);
  return ultimoDia >= Date.parse(`${String(fechaHasta).slice(0, 10)}T00:00:00Z`);
}

// Errores de los datos de una tarjeta ({ campo: "mensaje" }; {} si está bien).
// Lo usan el paso "Garantía" de la reserva y la garantía del check-in.
export function validarTarjeta(t, fechaHasta) {
  const errores = {};
  if (!luhnValido(t.numero)) errores.numero = "Número de tarjeta inválido.";
  if (!t.titular.trim()) errores.titular = "Ingresá el titular.";
  if (!leerVencimiento(t.vencimiento)) errores.vencimiento = "Vencimiento inválido (MM/AA).";
  else if (!vencimientoCubreSalida(t.vencimiento, fechaHasta)) {
    errores.vencimiento = "La tarjeta vence antes de la fecha de salida.";
  }
  if (!/^\d{3,4}$/.test(t.cvv)) errores.cvv = "3 o 4 dígitos.";
  return errores;
}

// { titular, numero, vencimientoMes, vencimientoAnio, cvv } listo para enviar.
// El backend lo valida y lo descarta: el número y el CVV nunca se guardan.
export function armarTarjetaParaEnviar(t) {
  const v = leerVencimiento(t.vencimiento);
  return {
    titular: t.titular.trim(),
    numero: soloDigitos(t.numero),
    vencimientoMes: v.mes,
    vencimientoAnio: v.anio,
    cvv: t.cvv,
  };
}

// Devuelve { campo: "mensaje" } con lo que falta o está mal; {} si está todo bien.
export function validarGarantia(garantia, { total, fechaHasta, reembolsable }) {
  if (garantia.tipo === TIPO_GARANTIA.TARJETA) return validarTarjeta(garantia.tarjeta, fechaHasta);

  const errores = {};
  // PREPAGO
  if (!garantia.medioPrepago) errores.medioPrepago = "Elegí un medio de pago.";
  const importe = Number(garantia.importePrepago);
  if (!(importe > 0)) errores.importePrepago = "Ingresá un importe mayor a cero.";
  else if (importe > total) errores.importePrepago = "El prepago no puede superar el total de la estadía.";
  else if (!reembolsable && importe !== total) {
    errores.importePrepago = "Una tarifa no reembolsable sin tarjeta se prepaga por el total.";
  }
  if (garantia.medioPrepago === "Tarjeta débito" && !garantia.referenciaPrepago.trim()) {
    errores.referenciaPrepago = "Ingresá la autorización de la tarjeta.";
  }
  return errores;
}

// Arma el bloque `garantia` del POST /reservas/con-garantia.
export function armarGarantiaParaEnviar(garantia) {
  if (garantia.tipo === TIPO_GARANTIA.TARJETA) {
    return { tipo: TIPO_GARANTIA.TARJETA, tarjeta: armarTarjetaParaEnviar(garantia.tarjeta) };
  }
  const referencia = garantia.referenciaPrepago.trim();
  return {
    tipo: TIPO_GARANTIA.PREPAGO,
    medios: [
      {
        tipo: garantia.medioPrepago,
        importe: Number(garantia.importePrepago),
        ...(referencia ? { referencia } : {}),
      },
    ],
  };
}
