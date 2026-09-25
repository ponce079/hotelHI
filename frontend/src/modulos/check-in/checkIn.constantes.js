// Mismas listas fijas que backend/src/modulos/check-in/checkIn.constantes.js,
// duplicadas a mano (misma convención que habitaciones y reservas).
//
// Corrección posterior (pedido explícito 2026-09-25): los 4 medios de la
// garantía pasan a ser los MISMOS que ya usa la seña de reserva (HU-88,
// ReservaWizard.jsx) — se reusan MEDIOS_PAGO_ESTADIA/MEDIOS_CON_TARJETA de
// pagoEstadia.constantes.js en vez de una lista propia con etiquetas
// distintas ("Tarjeta de crédito", "Depósito en efectivo"). Antes solo el
// depósito en efectivo generaba un PagoEstadia real; ahora los 4 lo hacen
// (ver GarantiaFieldset.jsx), igual que la seña.
import { MEDIOS_PAGO_ESTADIA, MEDIOS_CON_TARJETA } from "../pagos-estadia/pagoEstadia.constantes";

// "Online" no aplica acá (igual que en la seña): la garantía se confirma en
// el mostrador, en persona, nunca a distancia.
export const MEDIOS_GARANTIA = MEDIOS_PAGO_ESTADIA.filter((medio) => medio !== "Online");
export { MEDIOS_CON_TARJETA };
