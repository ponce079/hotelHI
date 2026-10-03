import { edadEnFecha, hoyEnHoraLocal } from "../../lib/fechas";
import { MAYORIA_EDAD } from "../check-in/checkInPantalla.constantes";

// Documento para mostrar: un menor registrado sin documento (con su justificación) no queda
// como "pendiente".
export function documentoDe(p, reserva) {
  if (p.numeroDocumento) return `${p.tipoDocumento ?? ""} ${p.numeroDocumento}`.trim();
  if (p.motivoSinDocumento) {
    const nacimiento = p.fechaNacimiento ? String(p.fechaNacimiento).slice(0, 10) : null;
    const ingreso = String(p.fechaDesde ?? reserva.fechaDesde).slice(0, 10);
    const menor = nacimiento && `${Number(nacimiento.slice(0, 4)) + 18}${nacimiento.slice(4)}` > ingreso;
    return menor ? "Sin documento (menor)" : "Sin documento";
  }
  return "Documento pendiente";
}
export const activa = (p) => p.asignaciones?.find((a) => !a.hasta);
export const fechaISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").slice(0, 10)) ? String(v).slice(0, 10) : null);
// Menor de edad (MAYORIA_EDAD) a la fecha de ingreso, calculado mientras se tipea el nacimiento.
export const esMenorDeEdad = (nacimiento, ingreso) => {
  const edad = fechaISO(nacimiento) && fechaISO(ingreso) ? edadEnFecha(fechaISO(nacimiento), fechaISO(ingreso)) : null;
  return edad !== null && edad < MAYORIA_EDAD;
};
// Quien se suma con la estadía en curso ingresa hoy, no en la fecha de entrada de la reserva.
export function ingresoPorDefecto(reserva) {
  const desde = String(reserva.fechaDesde ?? "").slice(0, 10);
  const hoy = hoyEnHoraLocal();
  return reserva.estado === "En curso" && hoy > desde && hoy < String(reserva.fechaHasta ?? "").slice(0, 10)
    ? hoy
    : desde;
}
export const CODIGO_PERSONA_ADICIONAL = "PERSONA_ADICIONAL_REQUIERE_CONFIRMACION";
// Qué pasa con la tarifa al registrar la salida. Antes de la salida prevista de la reserva: si la
// persona entró como adicional, se anulan sus cargos de las noches que no usa y la ocupación
// registrada baja en 1; si era de la reserva original, la tarifa no cambia.
export function mensajeSalida(persona, reserva) {
  if (!persona) return "";
  const anticipada = hoyEnHoraLocal() < String(reserva.fechaHasta ?? "").slice(0, 10);
  if (!anticipada) return "Se registra la salida de la estadía.";
  return persona.personaAdicional
    ? "Se anulan sus cargos «Persona adicional» de las noches que no usa y la ocupación registrada de la habitación baja en 1."
    : "La tarifa de la reserva no cambia por esta salida.";
}
export const nombreDeOcupante = (personas, id) => {
  const p = personas.find((x) => x.id === id);
  return p ? `${p.nombre} ${p.apellido}`.trim() : null;
};
export const moneda = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(v || 0);
