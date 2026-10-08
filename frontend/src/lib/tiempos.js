// Tiempos de espera del cliente HTTP (frontend/src/lib/api.js). La base es remota y cada consulta tarda cientos de
// milisegundos: las pantallas comunes esperan hasta 45 s y las operaciones que escriben mucho (check-in, walk-in,
// check-out y alta del mostrador) hasta 60 s. Se configuran por pedido con `{ timeout: ... }`.
export const TIMEOUT_DEFECTO_MS = 45000;
export const TIMEOUT_OPERACION_MS = 60000;

// Lo que se le muestra a la persona cuando se vence la espera. Una escritura NUNCA se reintenta sola: puede haber
// quedado registrada aunque la respuesta no llegó.
export const MENSAJE_DEMORA =
  "El sistema está tardando más de lo normal. Revisá en Llegadas o en la reserva si la operación quedó registrada antes de reintentar.";

export const CODIGO_DEMORA = "TIMEOUT_CLIENTE";
