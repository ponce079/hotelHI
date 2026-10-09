// Enmascarado del número de documento en listados (Ley 25.326, protección de datos personales): solo se
// muestran los últimos 4 caracteres. Con 4 o menos no se revela ninguno. El detalle de la reserva y las demás
// pantallas muestran el documento completo; esto es solo para listados.
export function enmascararNumeroDocumento(numero) {
  const texto = String(numero ?? "").trim();
  if (!texto) return "";
  return texto.length <= 4 ? "••••" : `•••• ${texto.slice(-4)}`;
}

// "DNI •••• 4127"
export function documentoEnmascarado(tipo, numero) {
  return [tipo, enmascararNumeroDocumento(numero)].filter(Boolean).join(" ");
}
