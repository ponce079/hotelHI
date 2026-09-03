// src/modulos/proveedores/proveedores.constantes.js

// CUIT en formato 00-00000000-0 (Guía Técnica, sección 1). Se valida acá
// y en el frontend: el chequeo del cliente es comodidad, el que manda es
// este — nunca confiar solo en el que corre en el navegador.
const CUIT_REGEX = /^\d{2}-\d{8}-\d$/;

// Razón social admite puntuación (S.A., S.R.L., & Cía.), a diferencia del
// NOMBRE_REGEX de Artículos que solo deja letras/números/espacios: acá
// bloquear el punto rompería la mitad de los nombres reales.
const RAZON_SOCIAL_REGEX = /^[\p{L}\p{N}\s.,&'()/-]+$/u;
const RAZON_SOCIAL_MAX_LENGTH = 150;

// "solo los 11 dígitos" -> "00-00000000-0". Deja pasar cualquier otra
// cosa tal cual vino para que la valide el regex y el error sea claro.
function normalizarCuit(valor) {
  if (typeof valor !== "string") return valor;
  const soloDigitos = valor.replace(/\D/g, "");
  if (soloDigitos.length !== 11) return valor.trim();
  return `${soloDigitos.slice(0, 2)}-${soloDigitos.slice(2, 10)}-${soloDigitos.slice(10)}`;
}

module.exports = { CUIT_REGEX, RAZON_SOCIAL_REGEX, RAZON_SOCIAL_MAX_LENGTH, normalizarCuit };
