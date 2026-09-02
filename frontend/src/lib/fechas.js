export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function primerDiaDelMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// El backend guarda una fecha "solo día" (sin hora) como medianoche UTC
// de ese día (new Date("YYYY-MM-DD")). Si se formatea con
// toLocaleDateString a secas, el navegador la convierte a su huso
// horario local y en Argentina (UTC-3) puede mostrar el día anterior.
// Usar esta función para CUALQUIER fecha-solo-día que venga del backend
// (fechaCheque, fecha de comprobante, etc.) — nunca
// new Date(x).toLocaleDateString() sin forzar timeZone: "UTC".
export function formatearFechaSolo(fechaISO) {
  return new Date(fechaISO).toLocaleDateString("es-AR", { timeZone: "UTC" });
}
