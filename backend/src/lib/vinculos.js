// Catálogo único del vínculo del adulto responsable con un menor de 18 (MAYORIA_EDAD). Misma lista
// que frontend/src/lib/vinculos.js (duplicada a mano; vinculos.test.js verifica que sean iguales).
//
// "Otro familiar" y "Otro adulto a cargo" exigen la autorización de los padres o tutores
// (autorizacionPresentada = true).
const VINCULOS_RESPONSABLE = ["Padre o madre", "Tutor legal", "Otro familiar", "Otro adulto a cargo"];
const VINCULOS_CON_AUTORIZACION = ["Otro familiar", "Otro adulto a cargo"];

const comparable = (valor) => String(valor ?? "").trim().toLocaleLowerCase("es");

// Valor canónico del catálogo o null si no está (sin distinguir mayúsculas).
function normalizarVinculo(valor) {
  const buscado = comparable(valor);
  if (!buscado) return null;
  return VINCULOS_RESPONSABLE.find((v) => comparable(v) === buscado) ?? null;
}

const requiereAutorizacion = (vinculo) => VINCULOS_CON_AUTORIZACION.includes(vinculo);

module.exports = { VINCULOS_RESPONSABLE, VINCULOS_CON_AUTORIZACION, normalizarVinculo, requiereAutorizacion };
