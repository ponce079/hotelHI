import { api } from "../../../lib/api";
import { HORAS_LLEGADA } from "../../ecommerce/ecommerce.constantes";

// Bloque "Reserva web" del detalle de reserva (etapa 2 del e-commerce):
// GET /api/reservas-web/:reservaId, endpoint interno con sesión. Una reserva
// del mostrador (sin datos web) responde 200 con null.
export async function obtenerDatosReservaWeb(reservaId) {
  const { data } = await api.get(`/reservas-web/${reservaId}`);
  return data ?? null;
}

// Solo es un bloque válido si vino un objeto con los datos de contacto.
export function esDatoWebValido(datos) {
  return Boolean(datos) && typeof datos === "object" && !Array.isArray(datos) && typeof datos.emailContacto === "string";
}

// "20-22" → "20 a 22 h" (mismas etiquetas que el formulario web).
export function textoHoraLlegada(valor) {
  if (!valor) return "No la indicó";
  return HORAS_LLEGADA.find((h) => h.valor === valor)?.etiqueta ?? valor;
}
