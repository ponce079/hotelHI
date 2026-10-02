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

// ---------------------------------------------------------------------------
// Check-in (pantalla única). Fechas "solo día" del backend (medianoche UTC) y
// fechas tipeadas en dd/mm/aaaa. Siempre en UTC para no correr el día.
// ---------------------------------------------------------------------------
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dos = (n) => String(n).padStart(2, "0");
const comoFecha = (valor) => (valor instanceof Date ? valor : new Date(String(valor).length === 10 ? `${valor}T00:00:00Z` : valor));

// "02/10/2026" (con ceros, a diferencia de formatearFechaSinHora).
export function formatearFechaDdMmAaaa(valor) {
  if (!valor) return "";
  const d = comoFecha(valor);
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

// "vie 02/10"
export function formatearDiaCorto(valor) {
  const d = comoFecha(valor);
  return `${DIAS_CORTOS[d.getUTCDay()]} ${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}`;
}

// "vie 02/10/2026"
export function formatearDiaLargo(valor) {
  const d = comoFecha(valor);
  return `${DIAS_CORTOS[d.getUTCDay()]} ${formatearFechaDdMmAaaa(d)}`;
}

// "Jueves 01/10/2026" — fecha de operación del encabezado.
export function formatearFechaOperacion(valor) {
  const d = comoFecha(valor);
  const dia = DIAS_LARGOS[d.getUTCDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${formatearFechaDdMmAaaa(d)}`;
}

// YYYY-MM-DD + n días (en UTC).
export function sumarDiasISO(iso, dias) {
  const d = comoFecha(String(iso).slice(0, 10));
  return new Date(d.getTime() + dias * 86400000).toISOString().slice(0, 10);
}

// Máscara de un campo dd/mm/aaaa mientras se tipea.
export function mascaraFecha(texto) {
  const d = String(texto ?? "").replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

// "14/03/1987" -> "1987-03-14"; null si no es una fecha real.
export function ddMmAaaaAISO(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? "").trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

// Años cumplidos en una fecha (las dos ISO YYYY-MM-DD).
export function edadEnFecha(nacimientoISO, fechaISO) {
  if (!nacimientoISO || !fechaISO) return null;
  const n = comoFecha(String(nacimientoISO).slice(0, 10));
  const f = comoFecha(String(fechaISO).slice(0, 10));
  let edad = f.getUTCFullYear() - n.getUTCFullYear();
  if (f.getUTCMonth() < n.getUTCMonth() || (f.getUTCMonth() === n.getUTCMonth() && f.getUTCDate() < n.getUTCDate())) edad--;
  return edad;
}

// Noches entre dos fechas "solo día".
export function nochesEntre(desde, hasta) {
  return Math.round((comoFecha(String(hasta).slice(0, 10)) - comoFecha(String(desde).slice(0, 10))) / 86400000);
}

// Fecha y hora real (timestamps), en hora argentina: "02/10/2026 11:03".
export function formatearFechaHora(valor) {
  if (!valor) return "—";
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("es-AR", {
      timeZone: ZONA_ARGENTINA,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(valor))
      .map((p) => [p.type, p.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}
