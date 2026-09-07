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

// Para fechas con hora real (creado con `new Date()`, no un "solo día" como
// las de arriba) — cuántos días pasaron desde `fechaIso` hasta ahora.
export function diasDesde(fechaIso) {
  return Math.floor((Date.now() - new Date(fechaIso).getTime()) / (1000 * 60 * 60 * 24));
}

// Presupuesto.plazoEntrega sigue siendo texto libre en la base (no se
// agregó un campo numérico — ver PresupuestoCargaModal), pero desde que ese
// modal pasó a un número + selector de unidad, todo lo cargado de ahí en
// adelante arranca siempre con el número (ej. "5 días hábiles"). Esto
// extrae ese número para poder ordenar/comparar objetivamente en la
// pantalla de comparación — devuelve null para valores viejos en texto
// libre que no matcheen (no se puede ordenar lo que no se puede parsear).
export function parsearDiasPlazo(texto) {
  const m = /^(\d+)/.exec((texto ?? "").trim());
  return m ? Number(m[1]) : null;
}
