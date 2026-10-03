// Catálogo único del vínculo del adulto responsable con un menor de 18. Misma lista que
// backend/src/lib/vinculos.js (duplicada a mano; backend/src/lib/vinculos.test.js las compara).
export const VINCULOS_RESPONSABLE = ["Padre o madre", "Tutor legal", "Otro familiar", "Otro adulto a cargo"];
// Estos dos exigen la autorización de los padres o tutores ("Autorización presentada").
export const VINCULOS_CON_AUTORIZACION = ["Otro familiar", "Otro adulto a cargo"];
export const requiereAutorizacion = (vinculo) => VINCULOS_CON_AUTORIZACION.includes(vinculo);
