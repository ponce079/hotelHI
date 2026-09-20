// HU-39/HU-44 — 3 campos obligatorios de los datos del huésped en el
// check-in walk-in (mismo problema existía en ReservaWizard.jsx, ver
// decisiones.md). Contacto acá es "email o teléfono" indistinto (un solo
// campo, sin separar), así que solo se exige que no esté vacío — no hay
// forma de aplicar un formato de email sin rechazar mal un teléfono válido.
// Separado de CheckInWalkIn.jsx (que sí importa React/JSX) para poder
// testearlo con un script Node plano, mismo criterio que
// backend/scripts/pruebas-*.js.
export function validarHuesped(huesped) {
  const errores = {};
  if (!huesped.nombre.trim()) errores.nombre = "El nombre y apellido son obligatorios.";
  if (!huesped.numeroDocumento.trim()) errores.numeroDocumento = "El número de documento es obligatorio.";
  if (!huesped.contacto.trim()) errores.contacto = "El contacto (email o teléfono) es obligatorio.";
  return errores;
}
