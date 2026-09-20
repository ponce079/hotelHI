// Check-in (HU-43 a HU-47). Mismo criterio que el resto del proyecto: listas
// fijas validadas en código, duplicadas a mano en el frontend
// (frontend/src/modulos/check-in/checkIn.constantes.js).

// HU-46: la validación real contra una pasarela de pago/tarjeta queda fuera
// de alcance de este sprint (limitación ya documentada en el backlog) — se
// modela como una confirmación manual del recepcionista, con el medio
// declarado a título informativo.
const MEDIOS_GARANTIA = ["Tarjeta de crédito", "Depósito en efectivo"];

const LIMITES_CHECKIN = {
  numeroDocumento: 30,
};

module.exports = { MEDIOS_GARANTIA, LIMITES_CHECKIN };
