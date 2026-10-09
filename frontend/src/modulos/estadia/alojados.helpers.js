import { documentoEnmascarado } from "../../lib/documento";
import { edadEnFecha, fechaArgentina, formatearDiaSemanaMes, hoyEnHoraLocal, nochesEntre } from "../../lib/fechas";
import { codigoPais, nombrePais } from "../../lib/paises";
import { MAYORIA_EDAD } from "../check-in/checkInPantalla.constantes";

// Helpers de "Huéspedes en casa". Todo es puro: "hoy" (YYYY-MM-DD en hora argentina) entra por parámetro y por
// defecto sale de hoyEnHoraLocal(). Las fechas sin hora se comparan como texto de 10 caracteres, sin zona del navegador.
export const VISTAS = { TODAS: "", HOY: "hoy", VENCIDAS: "vencidas" };
export const SIN_HABITACION = "Sin habitación asignada";
export const TOPE_ALOJADOS = 500;

const dia = (valor) => (valor ? String(valor).slice(0, 10) : "");
const nombreCompleto = (p) => `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim();

// Habitación actual de la persona: su asignación sin `hasta`, resuelta en las habitaciones de su reserva.
export function habitacionActual(persona) {
  const activa = [...(persona.asignaciones ?? [])].reverse().find((a) => !a.hasta);
  if (!activa) return null;
  const h = persona.reserva?.reservaHabitaciones?.find((rh) => rh.habitacionId === activa.habitacionId)?.habitacion;
  if (!h) return null;
  return { id: h.id ?? activa.habitacionId, numero: String(h.numero), tipo: h.tipoHabitacion?.nombre ?? "" };
}

export function edadDe(persona, hoy = hoyEnHoraLocal()) {
  return edadEnFecha(dia(persona.fechaNacimiento), hoy);
}

// Menor de 18 a hoy. Sin fecha de nacimiento no se puede saber: no es menor para la pantalla.
export function esMenor(persona, hoy = hoyEnHoraLocal()) {
  const edad = edadDe(persona, hoy);
  return edad !== null && edad < MAYORIA_EDAD;
}

export function iniciales(persona) {
  const letra = (t) => String(t ?? "").trim().charAt(0).toUpperCase();
  return `${letra(persona.nombre)}${letra(persona.apellido)}` || "?";
}

const porApellido = (a, b) =>
  String(a.apellido ?? "").localeCompare(String(b.apellido ?? ""), "es") ||
  String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es") ||
  a.id - b.id;

// Titular primero, después los demás adultos por apellido y al final los menores.
export function ordenarOcupantes(personas, hoy = hoyEnHoraLocal()) {
  const rango = (p) => (p.esTitular ? 0 : esMenor(p, hoy) ? 2 : 1);
  return [...personas].sort((a, b) => rango(a) - rango(b) || porApellido(a, b));
}

// Línea de documento: "DNI •••• 4127 · Argentina". Sin documento: "Sin documento · a cargo de <responsable>" (si el
// responsable está en la lista) o "Sin documento · <motivo>". Nunca queda un separador suelto ni un campo vacío.
export function lineaDocumento(persona, porId = new Map()) {
  if (persona.numeroDocumento) {
    const pais = persona.paisDocumento ? (nombrePais(codigoPais(persona.paisDocumento)) ?? persona.paisDocumento) : "";
    return [documentoEnmascarado(persona.tipoDocumento, persona.numeroDocumento), pais].filter(Boolean).join(" · ");
  }
  const responsable = persona.responsableId ? porId.get(persona.responsableId) : null;
  const detalle = responsable
    ? `a cargo de ${nombreCompleto(responsable)}`
    : String(persona.motivoSinDocumento ?? "").trim();
  return ["Sin documento", detalle].filter(Boolean).join(" · ");
}

// Estado de la salida de una habitación según su fechaHasta más tardía.
export function estadoSalida(salida, hoy = hoyEnHoraLocal()) {
  const fecha = dia(salida);
  if (!fecha) return { tipo: "sin-fecha", noches: null, texto: "" };
  if (fecha === hoy) return { tipo: "hoy", noches: 0, texto: "Sale hoy" };
  if (fecha < hoy) return { tipo: "vencida", noches: 0, texto: "Salida vencida" };
  const noches = nochesEntre(hoy, fecha);
  return { tipo: "noches", noches, texto: noches === 1 ? "queda 1 noche" : `quedan ${noches} noches` };
}

// "misma reserva que 412" / "que 410 y 412" / "que 410, 411 y 412".
export function textoMismaReserva(numeros) {
  if (!numeros.length) return "";
  const lista =
    numeros.length === 1 ? numeros[0] : `${numeros.slice(0, -1).join(", ")} y ${numeros[numeros.length - 1]}`;
  return `misma reserva que ${lista}`;
}

const compararNumeros = (a, b) => a.localeCompare(b, "es", { numeric: true });

// Una fila por habitación. Las personas sin asignación activa van en un grupo final "Sin habitación asignada".
export function agruparPorHabitacion(personas, hoy = hoyEnHoraLocal()) {
  const mapa = new Map();
  for (const p of personas) {
    const h = habitacionActual(p);
    const clave = h ? `h${h.numero}` : "sin";
    if (!mapa.has(clave)) mapa.set(clave, { clave, numero: h?.numero ?? null, tipo: h?.tipo ?? "", personas: [] });
    mapa.get(clave).personas.push(p);
  }
  const grupos = [...mapa.values()].map(({ personas: lista, ...g }) => {
    const ocupantes = ordenarOcupantes(lista, hoy);
    const salida =
      ocupantes
        .map((p) => dia(p.fechaHasta))
        .filter(Boolean)
        .sort()
        .pop() ?? "";
    const ingresos = ocupantes.map((p) => p.ingresoReal).filter(Boolean).sort((a, b) => new Date(a) - new Date(b));
    return {
      ...g,
      ocupantes,
      reservaId: ocupantes[0].reservaId,
      codigo: ocupantes[0].reserva?.codigoConfirmacion ?? "",
      ingreso: ingresos[0] ?? null,
      salida,
      estadoSalida: estadoSalida(salida, hoy),
      mismaReserva: [],
    };
  });
  grupos.sort((a, b) => (a.numero === null) - (b.numero === null) || (a.numero ? compararNumeros(a.numero, b.numero) : 0));
  for (const g of grupos) {
    g.mismaReserva = grupos
      .filter((o) => o !== g && o.numero !== null && o.reservaId === g.reservaId)
      .map((o) => o.numero);
  }
  return grupos;
}

// Marcas por ocupante dentro de su fila: "ingresó <fecha>" si entró otro día que el primero de la habitación y
// "sale <fecha>" si se va antes que la salida de la habitación.
export function notasOcupante(persona, grupo) {
  const notas = { ingreso: "", salida: "" };
  if (persona.ingresoReal && grupo.ingreso && fechaArgentina(persona.ingresoReal) !== fechaArgentina(grupo.ingreso)) {
    notas.ingreso = `ingresó ${formatearDiaSemanaMes(fechaArgentina(persona.ingresoReal))}`;
  }
  if (persona.fechaHasta && grupo.salida && dia(persona.fechaHasta) < grupo.salida) {
    notas.salida = `sale ${formatearDiaSemanaMes(persona.fechaHasta)}`;
  }
  return notas;
}

// Filas de una vista. "Sin habitación asignada" solo se ve en "Todas": las pestañas y los indicadores cuentan habitaciones.
export function filtrarPorVista(grupos, vista) {
  if (vista === VISTAS.HOY) return grupos.filter((g) => g.numero !== null && g.estadoSalida.tipo === "hoy");
  if (vista === VISTAS.VENCIDAS) return grupos.filter((g) => g.numero !== null && g.estadoSalida.tipo === "vencida");
  return grupos;
}

export const vistaValida = (valor) => (Object.values(VISTAS).includes(valor) ? valor : VISTAS.TODAS);

// Indicadores sobre la lista completa (sin búsqueda).
export function calcularIndicadores(personas, hoy = hoyEnHoraLocal()) {
  const grupos = agruparPorHabitacion(personas, hoy).filter((g) => g.numero !== null);
  const huespedes = (lista) => lista.reduce((n, g) => n + g.ocupantes.length, 0);
  const salenHoy = grupos.filter((g) => g.estadoSalida.tipo === "hoy");
  const vencidas = grupos.filter((g) => g.estadoSalida.tipo === "vencida");
  const menores = personas.filter((p) => esMenor(p, hoy)).length;
  return {
    habitaciones: grupos.length,
    reservas: new Set(personas.map((p) => p.reservaId)).size,
    huespedes: personas.length,
    adultos: personas.length - menores,
    menores,
    salenHoy: { habitaciones: salenHoy.length, huespedes: huespedes(salenHoy) },
    vencidas: { habitaciones: vencidas.length, huespedes: huespedes(vencidas) },
  };
}
