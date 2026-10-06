// Check-in (HU-43 a HU-47). Mismo criterio que el resto del proyecto: listas
// fijas validadas en código, duplicadas a mano en el frontend
// (frontend/src/modulos/check-in/checkIn.constantes.js).

// HU-46 — garantía del check-in. Ya NO es un pago: es una preautorización con tarjeta de
// crédito o un depósito en efectivo, en su propia tabla (garantias/garantiaEstadia.servicio.js).
// Débito y transferencia no se ofrecen: con débito el dinero sale de la cuenta del huésped y
// no se puede "retener", y la transferencia no está entre los medios previstos.
//
// La fuente de los medios y del monto es garantias/garantias.constantes.js; acá se reexportan con
// los nombres que ya usa el resto del check-in y el frontend
// (frontend/src/modulos/check-in/checkIn.constantes.js).
const { MEDIOS_CON_TARJETA } = require("../pagos-estadia/pagoEstadia.constantes");

const { MEDIOS_GARANTIA_CHECKIN, MONTO_PREAUTORIZACION_CHECKIN } = require("../garantias/garantias.constantes");
const MEDIOS_GARANTIA = MEDIOS_GARANTIA_CHECKIN;

// El monto es FIJO (política del hotel, server-side: no lo manda el cliente) y no tiene relación
// con el total de la estadía. Calcular "alojamiento pendiente + consumos por noche" queda como
// mejora anotada con el equipo (ver garantias.constantes.js).
const MONTO_GARANTIA = MONTO_PREAUTORIZACION_CHECKIN; // fijo, con nombre: ver garantias.constantes.js

const LIMITES_CHECKIN = {
  numeroDocumento: 30,
};

// Rediseño del check-in: roles que pueden usar las consultas con datos personales
// (llegadas, vista previa de ocupación y huésped por documento). Equivale a
// puede("gestionarCheckIn") del frontend (frontend/src/lib/sesion.jsx).
const ROLES_CHECK_IN = ["admin", "recepcionista"];

module.exports = { MEDIOS_GARANTIA, MEDIOS_CON_TARJETA, MONTO_GARANTIA, LIMITES_CHECKIN, ROLES_CHECK_IN };
