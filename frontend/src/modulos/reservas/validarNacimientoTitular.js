export function validarNacimientoTitular(valor, ingreso) {
  if (!valor) return "La fecha de nacimiento del titular es obligatoria.";
  const texto = String(valor).slice(0, 10),
    nacimiento = new Date(`${texto}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(texto) ||
    !Number.isFinite(nacimiento.getTime()) ||
    nacimiento.toISOString().slice(0, 10) !== texto ||
    nacimiento > new Date()
  )
    return "Ingresá una fecha de nacimiento válida, no futura.";
  const cumple18 = `${Number(texto.slice(0, 4)) + 18}${texto.slice(4)}`;
  if (ingreso && cumple18 > ingreso.slice(0, 10))
    return "El titular debe tener al menos 18 años en la fecha de ingreso.";
  return "";
}
