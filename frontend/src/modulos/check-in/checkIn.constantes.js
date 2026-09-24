// Mismas listas fijas que backend/src/modulos/check-in/checkIn.constantes.js,
// duplicadas a mano (misma convención que habitaciones y reservas).
//
// Corrección posterior (cierre del gap de garantía en efectivo): "Depósito
// en efectivo" ahora pide además un monto (ver GarantiaFieldset.jsx), que
// termina como un PagoEstadia real. "Tarjeta de crédito" sigue sin cambios.
export const MEDIO_GARANTIA_TARJETA = "Tarjeta de crédito";
export const MEDIO_GARANTIA_EFECTIVO = "Depósito en efectivo";
export const MEDIOS_GARANTIA = [MEDIO_GARANTIA_TARJETA, MEDIO_GARANTIA_EFECTIVO];
