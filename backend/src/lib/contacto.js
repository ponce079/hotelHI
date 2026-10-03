// Formatos de contacto del huésped. Huesped.contacto guarda un solo dato: el correo si lo hay
// y, si no, el teléfono.
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Teléfono: dígitos con +, espacios, guiones o paréntesis opcionales; entre 6 y 20 dígitos.
const PATRON_TELEFONO = /^\+?[\d\s()-]+$/;

function esEmail(valor) {
  return PATRON_EMAIL.test(String(valor ?? "").trim());
}

function esTelefono(valor) {
  const texto = String(valor ?? "").trim();
  const digitos = texto.replace(/\D/g, "").length;
  return PATRON_TELEFONO.test(texto) && digitos >= 6 && digitos <= 20;
}

function contactoDeHuesped({ email, telefono } = {}) {
  const correo = String(email ?? "").trim();
  if (correo) return correo.toLowerCase();
  const tel = String(telefono ?? "").trim();
  return tel || null;
}

module.exports = { PATRON_EMAIL, PATRON_TELEFONO, esEmail, esTelefono, contactoDeHuesped };
