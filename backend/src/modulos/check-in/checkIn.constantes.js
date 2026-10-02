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

// Corrección posterior (pedido explícito 2026-09-25): la garantía es un
// depósito de seguridad por daños/faltantes — un monto FIJO, igual para
// todo el hotel, sin relación con el total de la estadía (eso es la seña,
// HU-88, que se cobra al reservar). Antes se autorizaba/cobraba
// `reserva.totalEstimadoAlojamiento` completo, lo que fallaba apenas la
// reserva ya tenía una seña paga (el saldo pendiente real quedaba por
// debajo de ese monto) o la estadía era más barata que el total exigido.
// Server-side, no confiado al cliente: es una política del hotel, no un
// dato que mande cada request.
const MONTO_GARANTIA = 30000;

const LIMITES_CHECKIN = {
  numeroDocumento: 30,
};

// Rediseño del check-in: roles que pueden usar las consultas con datos personales
// (llegadas, vista previa de ocupación y huésped por documento). Equivale a
// puede("gestionarCheckIn") del frontend (frontend/src/lib/sesion.jsx).
const ROLES_CHECK_IN = ["admin", "recepcionista"];

module.exports = { MEDIOS_GARANTIA, MEDIOS_CON_TARJETA, MONTO_GARANTIA, LIMITES_CHECKIN, ROLES_CHECK_IN };
