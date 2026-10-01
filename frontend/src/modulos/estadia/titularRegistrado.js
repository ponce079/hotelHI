const documento = valor => String(valor || '').trim().toUpperCase().replace(/\s/g, '');

// Huésped y ocupante tienen identificadores de tablas distintas. El nombre,
// el correo y la posición en la lista no sirven para vincularlos.
export function titularRegistrado(personas, huesped, ocupanteId) {
  if (ocupanteId != null) return personas.find(p => String(p.id) === String(ocupanteId)) || null;
  const numero = documento(huesped?.numeroDocumento);
  const tipo = documento(huesped?.tipoDocumento);
  if (!numero || !tipo) return null;
  const coincidencias = personas.filter(p => documento(p.numeroDocumento) === numero && documento(p.tipoDocumento) === tipo);
  // No elegir arbitrariamente si hay identidades ambiguas; resuelve el backend.
  return coincidencias.length === 1 ? coincidencias[0] : null;
}
