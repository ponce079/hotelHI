import { api } from "../../../lib/api";
import { HORAS_LLEGADA } from "../../ecommerce/ecommerce.constantes";

// Bloque "Reserva web" del detalle de reserva (etapa 2 del e-commerce):
// GET /api/reservas-web/:reservaId, endpoint interno con sesión. Una reserva
// del mostrador (sin datos web) responde 404 → null.
export async function obtenerDatosReservaWeb(reservaId) {
  try {
    const { data } = await api.get(`/reservas-web/${reservaId}`);
    return data;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
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

// "Garantizada con VISA ••4242 · vence 08/2028" o "Prepagada con VISA ••4242".
export function textoGarantiaWeb({ tipoGarantia, tarjeta } = {}) {
  const medio = `${tarjeta?.marca ?? "tarjeta"} ••${tarjeta?.ultimos4 ?? "----"}`;
  if (tipoGarantia === "PREPAGO") return `Prepagada con ${medio}`;
  return `Garantizada con ${medio}${tarjeta?.vencimiento ? ` · vence ${tarjeta.vencimiento}` : ""}`;
}
