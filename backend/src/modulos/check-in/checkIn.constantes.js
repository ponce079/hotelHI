// Check-in (HU-43 a HU-47). Mismo criterio que el resto del proyecto: listas
// fijas validadas en código, duplicadas a mano en el frontend
// (frontend/src/modulos/check-in/checkIn.constantes.js).

// HU-46: la validación real contra una pasarela de pago/tarjeta queda fuera
// de alcance de este sprint (limitación ya documentada en el backlog) — la
// tarjeta se modela con la misma terminal simulada que ya usa la seña de
// reserva (HU-88, ver ReservaWizard.jsx), con el medio declarado a título
// informativo en la referencia.
//
// Corrección posterior (pedido explícito 2026-09-25): los 4 medios de la
// garantía pasan a ser los MISMOS que ya usa la seña de reserva — se
// reusan literalmente MEDIOS_PAGO_ESTADIA/MEDIOS_CON_TARJETA de
// pagoEstadia.constantes.js en vez de mantener una lista propia con
// etiquetas distintas ("Tarjeta de crédito", "Depósito en efectivo") que
// había que traducir a mano antes de llamar a crearPago. Antes solo
// "Depósito en efectivo" generaba un PagoEstadia real (HU-50); ahora los 4
// lo hacen, igual que la seña — Transferencia y las dos tarjetas dejan de
// ser una confirmación sin impacto en el saldo.
const {
  MEDIOS_PAGO_ESTADIA,
  MEDIOS_CON_TARJETA,
} = require("../pagos-estadia/pagoEstadia.constantes");

// "Online" no aplica acá (igual que en la seña): la garantía se confirma en
// el mostrador, en persona, nunca a distancia.
const MEDIOS_GARANTIA = MEDIOS_PAGO_ESTADIA.filter((medio) => medio !== "Online");

const LIMITES_CHECKIN = {
  numeroDocumento: 30,
};

module.exports = { MEDIOS_GARANTIA, MEDIOS_CON_TARJETA, LIMITES_CHECKIN };
