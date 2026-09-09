// Zona horaria de referencia para todo lo que en este archivo signifique
// "hoy" o "ahora" en el sentido en que lo vive un usuario en Argentina —
// nunca la del proceso/navegador ni UTC a secas. Argentina no tiene
// horario de verano desde 2009 (fijo UTC-3), así que un nombre de IANA
// resuelve esto de forma robusta sin hardcodear el offset.
const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

// "Hoy" en formato YYYY-MM-DD, calculado en hora argentina — para
// defaults de formularios/inputs type="date" (ej. VACIO.fecha en
// ComprobanteModal, fechaCobro en OrdenPagoDetalleModal). NUNCA
// new Date().toISOString().slice(0,10): eso calcula "hoy" en UTC, que
// después de ~21hs en Argentina ya es el día siguiente (mismo bug que
// causaba que un requerimiento creado a la noche quedara fechado mañana).
// "en-CA" da formato ISO (YYYY-MM-DD) directo, sin tener que armarlo a mano.
export function hoyEnHoraLocal() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
}

export function primerDiaDelMesISO() {
  return `${hoyEnHoraLocal().slice(0, 7)}-01`;
}

// El backend guarda una fecha "solo día" (sin hora) como medianoche UTC
// de ese día (new Date("YYYY-MM-DD")) — ej. fechaVencimiento, o
// ComprobanteProveedor.fecha cuando el tipo es "Factura" (fecha elegida
// por el usuario en un input type="date", ver crearComprobante en
// comprobantes.servicio.js). Si se formatea con toLocaleDateString a
// secas, el navegador la convierte a su huso horario local y en
// Argentina (UTC-3) muestra el día anterior. Usar esta función para
// CUALQUIER fecha-solo-día que venga del backend — nunca
// new Date(x).toLocaleDateString() sin forzar timeZone: "UTC".
export function formatearFechaSinHora(fechaISO) {
  return new Date(fechaISO).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

// Para timestamps reales (`DateTime @default(now())` nunca seteado a
// mano — fecha de creación de Requerimiento/Presupuesto/OrdenCompra/
// OrdenPago/MovimientoStock/RequerimientoLog, fechaAdjudicacion,
// fechaRecibida, o ComprobanteProveedor.fecha cuando el tipo es una Nota
// de Débito/Crédito — ver crearNota, mismo servicio: ahí sí es
// `new Date()`, no un "solo día" como la Factura). Sin forzar timeZone,
// el navegador convierte a hora local (Argentina, UTC-3), que es lo
// correcto para mostrar cuándo pasó algo — forzar UTC acá muestra el
// día siguiente después de ~21hs ART. Nunca usar formatearFechaSinHora
// para estos campos.
export function formatearTimestamp(fechaISO) {
  return new Date(fechaISO).toLocaleDateString("es-AR");
}

// ComprobanteProveedor.fecha (y el `fecha` de cualquier lista que mezcle
// comprobantes de distinto tipo, como Cuenta Corriente) tiene DOS
// significados distintos según `tipo`: en una Factura es una fecha-sin-
// hora elegida por el usuario; en una Nota de Débito/Crédito o un Pago
// es el instante real en que se generó. Mismo campo, semántica distinta
// — hay que mirar el tipo antes de decidir cómo formatear, si no se
// corre el mismo bug en una dirección para un tipo y en la contraria
// para el otro. Usar esto (nunca formatearFechaSinHora/formatearTimestamp
// sueltos) en cualquier columna "Fecha" que pueda mostrar Factura, Nota
// o Pago mezclados.
export function formatearFechaComprobante(tipo, fechaISO) {
  return tipo === "Factura" ? formatearFechaSinHora(fechaISO) : formatearTimestamp(fechaISO);
}

// Para fechas con hora real (creado con `new Date()`, no un "solo día" como
// las de arriba) — cuántos días pasaron desde `fechaIso` hasta ahora.
export function diasDesde(fechaIso) {
  return Math.floor((Date.now() - new Date(fechaIso).getTime()) / (1000 * 60 * 60 * 24));
}

// Estado de vencimiento de una fecha "solo día" (ComprobanteProveedor.
// fechaVencimiento) contra hoy — comparación por día calendario, no por
// milisegundos, para que "vence hoy" no dependa de a qué hora del día se
// mire la pantalla. "Hoy" se ancla en hora argentina (no en
// getUTCFullYear/Month/Date del instante actual): esas también son UTC
// puro, así que después de ~21hs ART el cálculo tomaba "hoy" como el día
// siguiente y corría el vencimiento un día antes de lo real. `umbralDias`
// (default 5) es el punto de corte para el badge amarillo, pedido como
// ajustable — se pasa desde comprobantes.constantes.js en vez de
// hardcodearse acá.
export function estadoVencimiento(fechaVencimiento, umbralDias = 5) {
  if (!fechaVencimiento) return null;
  const hoyUTC = Date.parse(`${hoyEnHoraLocal()}T00:00:00Z`);
  const venc = new Date(fechaVencimiento);
  const vencUTC = Date.UTC(venc.getUTCFullYear(), venc.getUTCMonth(), venc.getUTCDate());
  const diasRestantes = Math.round((vencUTC - hoyUTC) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= umbralDias) return "porVencer";
  return null;
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
