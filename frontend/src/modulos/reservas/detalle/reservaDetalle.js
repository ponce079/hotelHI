// Lógica pura de la pantalla de detalle de reserva (sin React ni red), para poder probarla sola:
// la lista de la cuenta (orden, "a devengar", totales), las acciones según estado y rol, y los datos
// del encabezado (línea de tiempo y seis datos clave).
import { formatearDiaLargo, formatearFechaHora, hoyEnHoraLocal, nochesEntre } from "../../../lib/fechas";
import { HORA_CHECKIN, HORA_CHECKOUT } from "../../check-in/checkInPantalla.constantes";
import {
  CONCEPTO_DEVOLUCION,
  CONCEPTO_GARANTIA,
  CONCEPTO_PAGO_ANTICIPADO,
  CONCEPTO_PENALIDAD_CANCELACION,
  CONCEPTO_PENALIDAD_NO_SHOW,
  CONCEPTO_SENIA,
} from "../../pagos-estadia/pagoEstadia.constantes";

// Cómo se rotula cada concepto en la línea de tiempo de la cuenta. "Seña" es histórico (reservas
// anteriores a la garantía con tarjeta); el resto de los conceptos se muestran con su nombre.
const CONCEPTO_DE_PAGO = {
  [CONCEPTO_SENIA]: "Seña",
  [CONCEPTO_PAGO_ANTICIPADO]: "Pago anticipado",
  [CONCEPTO_PENALIDAD_CANCELACION]: "Penalidad",
  [CONCEPTO_PENALIDAD_NO_SHOW]: "Penalidad",
  [CONCEPTO_DEVOLUCION]: "Devolución",
};
import { ESTADO_RESERVA } from "../reservas.constantes";

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

// Día (YYYY-MM-DD) de un instante, en hora argentina: un consumo cargado a las 22:30 del 02/10 es del
// 02/10 aunque en UTC ya sea el 03/10.
export const fechaArgentina = (valor) => new Date(valor).toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });

const dia = (valor) => String(valor).slice(0, 10);
const importeDe = (pago) => pago.medios.reduce((acc, m) => acc + Number(m.importe), 0);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
// "02/10/2026 15:19" -> "15:19"
const soloHora = (valor) => formatearFechaHora(valor).slice(11);

// ---------------------------------------------------------------------------
// Cuenta
// ---------------------------------------------------------------------------
export const FILTROS_CUENTA = [
  { id: "todo", texto: "Todo" },
  { id: "aloj", texto: "Alojamiento" },
  { id: "consumo", texto: "Consumos" },
  { id: "pago", texto: "Pagos" },
];

const PREFIJO_PERSONA_ADICIONAL = /^Persona adicional\s*—\s*/;

// Dentro de un mismo día: primero el alojamiento de la noche, después los consumos y al final los pagos.
const ORDEN_TIPO = { aloj: 1, consumo: 2, pago: 3 };

/**
 * Una sola lista por fecha con alojamiento (noche por noche, precio congelado), consumos y pagos.
 * - `previsto` ("a devengar"): noche que todavía no se cobró. Confirmada: todas; En curso: las de
 *   fecha posterior a hoy (hora argentina); Cerrada: ninguna.
 * - Cancelada: las noches quedan `anulado` (no se cobran) y no suman.
 * - La garantía no es un pago de la cuenta: no figura.
 * - Los consumos y pagos anulados se ven (tachados, con su motivo) pero no suman.
 */
export function armarMovimientos({ reserva, consumos = [], pagos = [], verificaciones = [], hoy = hoyEnHoraLocal() }) {
  // Cancelada y No-show: la estadía no ocurrió, los cargos de alojamiento no cuentan.
  const cancelada = reserva.estado === ESTADO_RESERVA.CANCELADA || reserva.estado === ESTADO_RESERVA.NO_SHOW;
  const variasHabitaciones = reserva.habitaciones.length > 1;
  const filas = [];

  for (const h of reserva.habitaciones) {
    const noches = h.reservaNoches ?? [];
    noches.forEach((n, i) => {
      const fecha = dia(n.fecha);
      const previsto =
        reserva.estado === ESTADO_RESERVA.CONFIRMADA || (reserva.estado === ESTADO_RESERVA.EN_CURSO && fecha > hoy);
      filas.push({
        id: `noche-${n.id}`,
        tipo: "aloj",
        fecha,
        hora: "",
        concepto: `Alojamiento · noche ${i + 1} de ${noches.length}`,
        detalle: [
          `Hab. ${h.numero}${h.tipo ? ` ${h.tipo}` : ""}`,
          reserva.planTarifario?.nombre,
          `${plural(h.adultos, "adulto", "adultos")}${h.menores ? ` y ${plural(h.menores, "menor", "menores")}` : ""}`,
        ]
          .filter(Boolean)
          .join(" · "),
        cargo: Number(n.precioNoche),
        previsto: previsto && !cancelada,
        anulado: cancelada,
        motivoAnulacion: cancelada
          ? reserva.estado === ESTADO_RESERVA.NO_SHOW
            ? "Reserva marcada como no-show"
            : "Reserva cancelada"
          : null,
        nocheId: n.id,
        ajustada: Boolean(n.ajustada),
        precioOriginal: n.ajustada ? Number(n.precioOriginal) : null,
      });
    });
  }

  for (const c of consumos) {
    // El cargo de una persona adicional se guarda como consumo "Otro": en la cuenta se lee por lo que es.
    const personaAdicional = PREFIJO_PERSONA_ADICIONAL.test(c.descripcion ?? "");
    filas.push({
      id: `consumo-${c.id}`,
      tipo: "consumo",
      fecha: fechaArgentina(c.fechaServicio || c.fechaHora),
      hora: String(c.fechaHora ?? ""),
      concepto: personaAdicional ? "Persona adicional" : c.tipoServicio,
      detalle: [
        personaAdicional
          ? c.descripcion.replace(PREFIJO_PERSONA_ADICIONAL, "")
          : c.descripcion || (c.articuloNombre ? `${c.articuloNombre} × ${c.cantidad}` : null),
        variasHabitaciones && c.habitacionNumero ? `Hab. ${c.habitacionNumero}` : null,
        c.registradoPor ? `cargado por ${c.registradoPor}` : null,
        c.incluido ? "incluido en la tarifa" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      cargo: Number(c.monto),
      anulado: Boolean(c.anulado),
      motivoAnulacion: c.motivoAnulacion ?? null,
      consumoId: c.id,
    });
  }

  for (const v of verificaciones.filter((x) => Number(x.monto) > 0)) {
    filas.push({
      id: `revision-${v.id}`,
      tipo: "consumo",
      fecha: fechaArgentina(v.fechaHora),
      hora: String(v.fechaHora ?? ""),
      concepto: "Revisión de la habitación",
      detalle: [v.descripcion, v.registradoPor ? `por ${v.registradoPor}` : null].filter(Boolean).join(" · "),
      cargo: Number(v.monto),
      anulado: false,
    });
  }

  for (const p of pagos.filter((x) => x.concepto !== CONCEPTO_GARANTIA)) {
    filas.push({
      id: `pago-${p.id}`,
      tipo: "pago",
      fecha: fechaArgentina(p.fecha),
      hora: String(p.fecha ?? ""),
      concepto: CONCEPTO_DE_PAGO[p.concepto] ?? "Pago",
      detalle: p.medios.map((m) => [m.medioPago, m.referencia].filter(Boolean).join(" · ")).join(" + "),
      pago: importeDe(p),
      anulado: Boolean(p.anulado),
      motivoAnulacion: p.motivoAnulacion ?? null,
    });
  }

  return filas.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] ||
      a.hora.localeCompare(b.hora) ||
      a.id.localeCompare(b.id),
  );
}

export function filtrarMovimientos(movimientos, filtro) {
  return filtro === "todo" ? movimientos : movimientos.filter((m) => m.tipo === filtro);
}

// Totales de la lista: lo anulado no suma; las noches "a devengar" sí (es lo que va a costar la estadía).
export function totalesMovimientos(movimientos) {
  const vigentes = movimientos.filter((m) => !m.anulado);
  const suma = (tipo, campo) => vigentes.filter((m) => m.tipo === tipo).reduce((acc, m) => acc + (m[campo] ?? 0), 0);
  const alojamiento = suma("aloj", "cargo");
  const consumos = suma("consumo", "cargo");
  const pagos = suma("pago", "pago");
  return { alojamiento, consumos, total: alojamiento + consumos, pagos, saldo: alojamiento + consumos - pagos };
}

// ---------------------------------------------------------------------------
// Acciones del encabezado, según estado y permisos
// ---------------------------------------------------------------------------
/**
 * Devuelve { principales, menu }: botones del encabezado y acciones del menú ⋯, en orden de
 * aparición. Cada acción es { id, texto, tipo } con tipo "primaria" | "secundaria" | "destructiva".
 * `permisos` son los resultados de `puede(...)`. El gerente solo ve: su único cambio es "Ajustar
 * precio", que vive en las filas de alojamiento de la Cuenta (no en el encabezado).
 */
export function accionesDeReserva(estado, permisos) {
  const principales = [];
  const menu = [];
  if (estado === ESTADO_RESERVA.CONFIRMADA) {
    if (permisos.gestionarReservas) principales.push({ id: "modificar", texto: "Modificar reserva", tipo: "secundaria" });
    if (permisos.gestionarCheckIn) principales.push({ id: "check-in", texto: "Iniciar check-in", tipo: "primaria" });
    if (permisos.gestionarReservas) menu.push({ id: "cancelar", texto: "Cancelar reserva", tipo: "destructiva" });
  } else if (estado === ESTADO_RESERVA.EN_CURSO) {
    if (permisos.registrarConsumoServicio)
      principales.push({ id: "consumo", texto: "Agregar consumo", tipo: "secundaria" });
    if (permisos.verCheckOut) principales.push({ id: "check-out", texto: "Hacer check-out", tipo: "primaria" });
  } else if (estado === ESTADO_RESERVA.CERRADA) {
    if (permisos.verComprobantesEstadia)
      principales.push({ id: "comprobante", texto: "Ver comprobante", tipo: "secundaria" });
  }
  return { principales, menu };
}

// "Ajustar precio" (solo gerente): en los mismos estados en que se permitía antes.
export const puedeAjustarPrecioEn = (estado) => [ESTADO_RESERVA.CONFIRMADA, ESTADO_RESERVA.EN_CURSO].includes(estado);

// ---------------------------------------------------------------------------
// Encabezado
// ---------------------------------------------------------------------------
const diaCorto = (valor) => formatearDiaLargo(valor).slice(0, 9); // "vie 02/10"

/**
 * Línea de tiempo chica: Confirmada → En curso → Cerrada (o Confirmada → Cancelada). `personas`
 * (opcional) trae ingresoReal/salidaReal para mostrar cuándo ocurrió, si se sabe.
 */
export function lineaDeTiempo(reserva, personas = []) {
  const e = reserva.estado;
  if (e === ESTADO_RESERVA.NO_SHOW)
    return [
      { texto: "Confirmada", estado: "hecho", sub: "" },
      { texto: "No presentada", estado: "actual", sub: "" },
    ];
  if (e === ESTADO_RESERVA.CANCELADA)
    return [
      { texto: "Confirmada", estado: "hecho", sub: "" },
      { texto: "Cancelada", estado: "actual", sub: "" },
    ];
  const ingreso = personas.map((p) => p.ingresoReal).filter(Boolean).sort()[0];
  const salida = personas.map((p) => p.salidaReal).filter(Boolean).sort().at(-1);
  return [
    { texto: "Confirmada", estado: e === ESTADO_RESERVA.CONFIRMADA ? "actual" : "hecho", sub: "" },
    {
      texto: "En curso",
      estado: e === ESTADO_RESERVA.EN_CURSO ? "actual" : e === ESTADO_RESERVA.CERRADA ? "hecho" : "pendiente",
      sub: e === ESTADO_RESERVA.CONFIRMADA ? `llega ${diaCorto(reserva.fechaDesde)}` : ingreso ? formatearFechaHora(ingreso) : "",
    },
    {
      texto: "Cerrada",
      estado: e === ESTADO_RESERVA.CERRADA ? "actual" : "pendiente",
      sub: e === ESTADO_RESERVA.CERRADA && salida ? formatearFechaHora(salida) : `sale ${diaCorto(reserva.fechaHasta)}`,
    },
  ];
}

// Los seis datos clave del encabezado. `personas` son los ocupantes ya leídos (para el ingreso real y
// cuántas personas hay registradas).
export function datosClave(reserva, personas = [], hoy = hoyEnHoraLocal()) {
  const registradas = personas.filter((p) => p.estado !== "Cancelado");
  const adultos = reserva.habitaciones.reduce((acc, h) => acc + h.adultos, 0);
  const menores = reserva.habitaciones.reduce((acc, h) => acc + h.menores, 0);
  const ingreso = personas.map((p) => p.ingresoReal).filter(Boolean).sort()[0];
  const salida = personas.map((p) => p.salidaReal).filter(Boolean).sort().at(-1);
  const h = reserva.habitaciones;
  const noches = reserva.noches ?? nochesEntre(reserva.fechaDesde, reserva.fechaHasta);
  const nocheActual = Math.min(noches, Math.max(1, nochesEntre(reserva.fechaDesde, hoy) + 1));
  const e = reserva.estado;
  const nombre = reserva.huesped
    ? [reserva.huesped.nombres, reserva.huesped.apellido].filter(Boolean).join(" ") || reserva.huesped.nombre
    : "—";
  return {
    titular: {
      principal: nombre,
      sub: reserva.huesped ? `${reserva.huesped.tipoDocumento} ${reserva.huesped.numeroDocumento}` : "",
    },
    entrada: {
      principal: formatearDiaLargo(reserva.fechaDesde),
      sub: e === ESTADO_RESERVA.CONFIRMADA || !ingreso ? `desde las ${HORA_CHECKIN}` : `ingresó ${soloHora(ingreso)}`,
    },
    salida: {
      principal: formatearDiaLargo(reserva.fechaHasta),
      sub: e === ESTADO_RESERVA.CERRADA && salida ? `salió ${soloHora(salida)}` : `hasta las ${HORA_CHECKOUT}`,
    },
    noches: {
      principal: String(noches),
      sub:
        e === ESTADO_RESERVA.EN_CURSO
          ? `noche ${nocheActual} de ${noches}`
          : e === ESTADO_RESERVA.CERRADA
            ? "completada"
            : e === ESTADO_RESERVA.CANCELADA
              ? "cancelada"
              : e === ESTADO_RESERVA.NO_SHOW
                ? "no presentada"
                : "sin iniciar",
    },
    habitacion: {
      principal: h.length === 1 ? `${h[0].numero}${h[0].tipo ? ` · ${h[0].tipo}` : ""}` : `${h.length} habitaciones`,
      sub: h.length === 1 ? `piso ${h[0].piso} · capacidad ${h[0].capacidad}` : h.map((x) => x.numero).join(" · "),
    },
    ocupacion: {
      principal: [plural(adultos, "adulto", "adultos"), menores ? plural(menores, "menor", "menores") : null]
        .filter(Boolean)
        .join(" · "),
      sub:
        e === ESTADO_RESERVA.CONFIRMADA
          ? "reservada"
          : plural(registradas.length, "huésped registrado", "huéspedes registrados"),
    },
  };
}
