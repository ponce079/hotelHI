// Check-in (HU-43 a HU-47). Mismo criterio que el resto del proyecto: listas
// fijas validadas en código, duplicadas a mano en el frontend
// (frontend/src/modulos/check-in/checkIn.constantes.js).

// HU-46: la validación real contra una pasarela de pago/tarjeta queda fuera
// de alcance de este sprint (limitación ya documentada en el backlog) — se
// modela como una confirmación manual del recepcionista, con el medio
// declarado a título informativo.
//
// Corrección posterior (cierre del gap de garantía en efectivo, ver
// checkIn.servicio.js): "Tarjeta de crédito" sigue siendo pura confirmación
// simulada, sin impacto en el saldo — pero "Depósito en efectivo" ahora sí
// registra un PagoEstadia real (HU-50) por el monto que confirma el
// recepcionista, para que consolidarCargos lo descuente en el check-out.
const MEDIO_GARANTIA_TARJETA = "Tarjeta de crédito";
const MEDIO_GARANTIA_EFECTIVO = "Depósito en efectivo";
const MEDIOS_GARANTIA = [MEDIO_GARANTIA_TARJETA, MEDIO_GARANTIA_EFECTIVO];

const LIMITES_CHECKIN = {
  numeroDocumento: 30,
};

module.exports = { MEDIOS_GARANTIA, MEDIO_GARANTIA_TARJETA, MEDIO_GARANTIA_EFECTIVO, LIMITES_CHECKIN };
