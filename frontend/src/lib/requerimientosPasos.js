import { ESTADOS_REQUERIMIENTO, TIPOS_REQUERIMIENTO } from "./constantes";

// Rediseño de Requerimientos, punto 4 — a qué paso (0-3) del circuito
// "Solicitud → Aprobación → Compra o transferencia → Recepción"
// corresponde el estado actual de un requerimiento. COMPRA y
// TRANSFERENCIA recorren estados distintos, así que cada uno arma su
// propia escalera. Vive separado de MiniPasos.jsx para no mezclar "cómo
// se pinta" con "qué paso es" — y para poder testear esto sin renderizar
// nada.
//
// Para COMPRA, el paso 4 (Recepción) no está en el estado del
// requerimiento — eso vive en la OrdenCompra vinculada (un requerimiento
// "Aprobado" se queda así para siempre aunque su OC ya se haya recibido,
// ver ordenesCompra.servicio.js Fase 4). Por eso listarRequerimientos
// manda `ocRecibida` ya calculado — no repetir esa lógica acá.
export function pasoDeRequerimiento(r) {
  if (r.tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA) {
    switch (r.estado) {
      case ESTADOS_REQUERIMIENTO.RECIBIDA:
      case ESTADOS_REQUERIMIENTO.CERRADA:
        return 3;
      case ESTADOS_REQUERIMIENTO.EN_TRANSITO:
        return 2;
      case ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK:
        return 1;
      default:
        return 0; // Pendiente: recién solicitada
    }
  }

  // COMPRA
  if (r.ocRecibida) return 3;
  if (r.estado === ESTADOS_REQUERIMIENTO.APROBADO) return 2;
  if (r.estado === ESTADOS_REQUERIMIENTO.EN_COTIZACION) return 1;
  return 0; // Pendiente / Sugerida
}
