// Catálogo único de tipos de documento, para el huésped titular de la reserva y para cada
// ocupante. Misma lista que backend/src/lib/tiposDocumento.js (duplicada a mano, misma
// convención que el resto de las constantes compartidas): el backend rechaza cualquier otro valor.
export const TIPOS_DOCUMENTO = ["DNI", "Pasaporte", "Cédula de identidad", "Libreta de Enrolamiento", "Libreta Cívica"];

// Etiqueta del campo del número según el tipo elegido.
export const ETIQUETAS_NUMERO_DOCUMENTO = {
  DNI: "Número de DNI",
  Pasaporte: "Número de pasaporte",
  "Cédula de identidad": "Número de cédula",
  "Libreta de Enrolamiento": "Número de libreta de enrolamiento",
  "Libreta Cívica": "Número de libreta cívica",
};
