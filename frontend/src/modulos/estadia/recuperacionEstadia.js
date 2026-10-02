const requiereIntervencion = (error) =>
  ["BASE_OCUPADA", "ESQUEMA_ESTADIA_INCOMPLETO"].includes(error?.response?.data?.codigo);
export const reintentarLecturaEstadia = (intentos, error) => !requiereIntervencion(error) && intentos < 2;

// Exclusivo del POST /titular: el backend lo hace idempotente con un bloqueo
// de reserva y un evento persistido. No aplicar a altas, pagos ni check-in.
export function reintentarTitular(intentos, error) {
  if (intentos >= 2 || requiereIntervencion(error)) return false;
  return !error?.response || [500, 502, 503, 504].includes(error.response.status);
}
export const demoraReintentoTitular = (intento) => Math.min(1000 * (intento + 1), 2000);
