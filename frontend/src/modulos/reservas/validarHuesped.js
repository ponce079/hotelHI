// HU-36/HU-39/HU-42 — nombre y documento del huésped son obligatorios para
// dar de alta o modificar una reserva. Contacto queda afuera a propósito
// (no es lo mismo que Check-in walk-in, ver validarHuesped.js de ese
// módulo): acá el aviso de ReservaWizard.jsx ya contempla que quede vacío
// ("Sin datos de contacto la confirmación no se puede enviar al huésped:
// queda registrada como aviso interno para el mostrador") — es un campo
// opcional por diseño, no un descuido. Preferencias tampoco se valida, es
// opcional en ambos formularios.
//
// Duplicada a mano en vez de compartida con check-in/validarHuesped.js:
// mismo criterio que ya usa el proyecto para constantes/validaciones chicas
// entre módulos (ver "duplicada a mano" en checkIn.constantes.js y
// reservas.constantes.js) — y acá además las reglas ya no son idénticas
// (contacto obligatorio en un lado, opcional en el otro), así que ni
// convenía forzarlas a compartir una sola función con un flag.
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarHuesped(huesped) {
  const errores = {};
  if (!huesped.nombre.trim()) errores.nombre = "El nombre y apellido son obligatorios.";
  if (!huesped.numeroDocumento.trim()) errores.numeroDocumento = "El número de documento es obligatorio.";
  if (!huesped.contacto.trim()) errores.contacto = "El correo electrÃ³nico es obligatorio.";
  else if (!PATRON_EMAIL.test(huesped.contacto.trim())) errores.contacto = "IngresÃ¡ un correo electrÃ³nico vÃ¡lido.";
  return errores;
}
