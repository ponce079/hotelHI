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

// Corrección posterior (pedido explícito 2026-09-25): la garantía es un
// depósito de seguridad por daños/faltantes — un monto FIJO, igual para
// todo el hotel, sin relación con el total de la estadía (eso es la seña,
// HU-88). Antes se autorizaba/cobraba reserva.totalEstimadoAlojamiento
// completo, lo que fallaba apenas la reserva ya tenía una seña paga o la
// estadía costaba menos que ese total — ver checkIn.constantes.js
// (backend), que es donde este valor se aplica de verdad; acá solo sirve
// para mostrarlo en pantalla antes de confirmar.
export const MONTO_GARANTIA = 30000;
