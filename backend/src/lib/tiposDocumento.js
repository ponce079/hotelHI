// Catálogo único de tipos de documento, para el huésped titular de la reserva y para cada
// ocupante. Misma lista que frontend/src/lib/tiposDocumento.js (duplicada a mano, misma
// convención que el resto de las constantes compartidas).
//
// El tipo forma parte de la clave de identidad (persona.servicio.js: claveDocumento), que se
// calcula en mayúsculas: corregir mayúsculas/minúsculas de un valor guardado no cambia la clave.
const TIPOS_DOCUMENTO = ["DNI", "Pasaporte", "Cédula de identidad", "Libreta de Enrolamiento", "Libreta Cívica"];

const comparable = (valor) => String(valor ?? "").trim().toLocaleUpperCase("es");

// Devuelve el valor canónico del catálogo o null si no está (sin distinguir mayúsculas).
function normalizarTipoDocumento(valor) {
  const buscado = comparable(valor);
  if (!buscado) return null;
  return TIPOS_DOCUMENTO.find((tipo) => comparable(tipo) === buscado) ?? null;
}

module.exports = { TIPOS_DOCUMENTO, normalizarTipoDocumento };
