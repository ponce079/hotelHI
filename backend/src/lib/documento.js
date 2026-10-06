// Número de documento comparable: mayúsculas y solo letras/dígitos.
// "45.112.902", "45 112 902" y "45112902" son el mismo documento.
function normalizarNumeroDocumento(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function documentosCoinciden(a, b) {
  const x = normalizarNumeroDocumento(a);
  return x !== "" && x === normalizarNumeroDocumento(b);
}

// Nombre comparable: sin tildes, mayúsculas/minúsculas ni espacios de más.
function claveNombre(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizarNumeroDocumento, documentosCoinciden, claveNombre };
