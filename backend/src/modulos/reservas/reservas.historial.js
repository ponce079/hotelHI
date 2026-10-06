// Historial de una reserva (solo lectura): une en una sola línea de tiempo lo que hoy está repartido
// en varias tablas — eventos de la ficha de ocupantes (EventoEstadia), confirmaciones enviadas
// (Notificacion), pagos con sus anulaciones, consumos con sus anulaciones y ajustes manuales de
// precio (ReservaNoche).
//
// No modifica nada ni agrega columnas: cada evento sale de un registro que ya tiene fecha. Lo que
// el sistema no guarda con fecha (cancelación, cambios de ocupación del check-in, anulación de un
// pago) no se inventa: no aparece.
//
// armarHistorial es pura (no toca la base) para poder probarla sola; obtenerHistorial hace las lecturas.
const prisma = require("../../lib/prisma");

const LIMITE_EVENTOS = 500;

const plata = (n) => `$ ${Number(n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
const nombreDe = (p) => `${p?.nombre ?? ""} ${p?.apellido ?? ""}`.trim();
const ddmmaaaa = (v) => {
  const s = String(v instanceof Date ? v.toISOString() : v ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? "");
};
const unir = (partes) => partes.filter(Boolean).join(" · ");

// Qué es cada acción de la ficha en lenguaje de recepción. `tipo` agrupa para la pantalla.
const TITULOS_FICHA = {
  cancelar: "Ficha dada de baja",
  retirar: "Salida registrada",
  verificar: "Documento verificado",
  ingresar: "Ingreso registrado",
  "Agregar ocupante": "Persona agregada",
  "Actualizar ocupante": "Ficha actualizada",
  "Cambio de documento": "Documento modificado",
  "Corrección de datos personales": "Datos personales corregidos",
  "Cambio de titular de habitación": "Cambio de titular de la habitación",
  "Cambio de habitación": "Cambio de habitación",
  "Persona adicional": "Persona adicional",
  "Ocupación ajustada": "Ocupación ajustada",
  "Check-in: ocupantes registrados": "Check-in confirmado",
  "Titular distinto del de la reserva": "Titular distinto del de la reserva",
  "Titular incorporado como ocupante": "Titular incorporado a la estadía",
};

// Eventos de la ficha que repiten lo que ya cuentan los consumos (cargo y anulación, con su motivo): no se
// listan dos veces.
const ACCIONES_REPETIDAS = new Set(["Agregar cargos", "Anular cargos"]);

const CAMPOS_PERSONALES = {
  tipoDocumento: "tipo",
  paisDocumento: "país emisor",
  numeroDocumento: "número",
  nombre: "nombre",
  apellido: "apellido",
  fechaNacimiento: "nacimiento",
};

// "número: 30512874 → 30512875" (solo lo que cambió).
function cambiosDe(d) {
  if (!d.anterior || !d.nuevo) return null;
  const valor = (k, x) => (x == null || x === "" ? "—" : k === "fechaNacimiento" ? ddmmaaaa(x) : x);
  return (
    Object.keys(d.nuevo)
      .filter((k) => d.anterior[k] !== d.nuevo[k])
      .map((k) => `${CAMPOS_PERSONALES[k] ?? k}: ${valor(k, d.anterior[k])} → ${valor(k, d.nuevo[k])}`)
      .join(", ") || null
  );
}

const personasTexto = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const ocupacionTexto = (o) =>
  o
    ? personasTexto(o.adultos ?? 0, "adulto", "adultos") +
      (o.menores ? ` y ${personasTexto(o.menores, "menor", "menores")}` : "")
    : "—";

function detalleFicha(accion, d, { personas, habitaciones }) {
  const persona = (id) => nombreDe(personas.get(id)) || null;
  const habitacion = (id) => habitaciones.get(id) ?? id;
  switch (accion) {
    case "Check-in: ocupantes registrados": {
      const n = d.ocupanteIds?.length ?? 0;
      const menores = (d.menores ?? []).map((m) =>
        unir([
          `${persona(m.ocupanteId) ?? "Menor"} a cargo de ${persona(m.responsableId) ?? "otro adulto"}`,
          m.vinculo,
          m.autorizacionPresentada ? "autorización presentada" : null,
        ]),
      );
      return unir([`${personasTexto(n, "persona registrada", "personas registradas")}`, ...menores]);
    }
    case "Titular distinto del de la reserva":
      return d.motivo ?? null;
    case "Titular incorporado como ocupante":
      return unir([persona(d.ocupanteId), d.creado === false ? "ya estaba registrado" : null]);
    case "Cambio de habitación":
      return unir([
        persona(d.ocupanteId),
        `de la habitación ${habitacion(d.desdeHabitacionId) ?? "—"} a la ${habitacion(d.habitacionId)}`,
        d.nuevoTitularId ? `nuevo titular de la que deja: ${persona(d.nuevoTitularId) ?? "otra persona"}` : null,
        d.motivo,
      ]);
    case "Cambio de titular de habitación":
      return unir([
        `Habitación ${habitacion(d.habitacionId)}`,
        d.anteriorId ? `antes: ${persona(d.anteriorId) ?? "otro titular"}` : null,
        d.ocupanteId ? `ahora: ${persona(d.ocupanteId) ?? "otra persona"}` : null,
        d.motivo,
      ]);
    case "Persona adicional":
      return unir([
        persona(d.ocupanteId),
        `Habitación ${habitacion(d.habitacionId)}`,
        d.categoria === "menor" ? "menor sin cargo" : d.monto != null ? `${plata(d.monto)} por ${personasTexto(d.noches ?? 0, "noche", "noches")}` : null,
      ]);
    case "Ocupación ajustada":
      return unir([
        `Habitación ${habitacion(d.habitacionId)}`,
        `${ocupacionTexto(d.ocupacionAnterior)} → ${ocupacionTexto(d.ocupacionNueva)}`,
        d.motivo,
      ]);
    case "Agregar ocupante":
    case "Actualizar ocupante":
      return unir([
        persona(d.ocupanteId),
        d.habitacionId ? `Habitación ${habitacion(d.habitacionId)}` : null,
        d.cambio ? "cambio de habitación" : null,
      ]);
    default:
      return unir([
        d.ocupanteId ? persona(d.ocupanteId) : null,
        cambiosDe(d),
        d.habitacionId ? `Habitación ${habitacion(d.habitacionId)}` : null,
        d.motivo,
      ]);
  }
}

function eventoFicha(e, contexto) {
  let detalle = "";
  try {
    detalle = detalleFicha(e.accion, JSON.parse(e.detalle), contexto) || "";
  } catch {
    detalle = "";
  }
  return {
    id: `ficha-${e.id}`,
    fecha: e.fecha,
    tipo: "ficha",
    titulo: TITULOS_FICHA[e.accion] ?? e.accion,
    detalle,
    operador: e.operador ?? null,
  };
}

function eventoNotificacion(n) {
  const titulo =
    n.canal === "Interno"
      ? `Aviso interno${n.destinatarioArea ? ` a ${n.destinatarioArea}` : ""}`
      : n.canal === "SMS"
        ? "Confirmación enviada por SMS"
        : "Confirmación enviada por correo";
  return {
    id: `notificacion-${n.id}`,
    fecha: n.fechaEnvio,
    tipo: "confirmacion",
    titulo,
    detalle: n.canal === "Interno" ? "" : n.destinatarioArea ?? "",
    operador: null,
  };
}

const TITULO_PAGO = {
  // Conceptos históricos (reservas anteriores a la garantía con tarjeta).
  Seña: "Seña registrada",
  Garantía: "Garantía registrada",
  // Garantía con tarjeta de crédito.
  "Pago anticipado": "Pago anticipado registrado",
  "Penalidad por cancelación": "Penalidad por cancelación cobrada",
  "Penalidad no-show": "Penalidad por no-show cobrada",
  Devolución: "Devolución registrada",
};

function eventoPago(p) {
  const importe = p.medios.reduce((acc, m) => acc + Number(m.importe), 0);
  const medios = p.medios.map((m) => (m.referencia ? `${m.medioPago} (ref. ${m.referencia})` : m.medioPago));
  return {
    id: `pago-${p.id}`,
    fecha: p.fecha,
    tipo: "pago",
    titulo: TITULO_PAGO[p.concepto] ?? "Pago registrado",
    detalle: unir([plata(importe), medios.join(" + "), p.anulado ? `Anulado: ${p.motivoAnulacion ?? "sin motivo"}` : null]),
    operador: null,
    anulado: p.anulado,
  };
}

function eventosConsumo(c, habitaciones) {
  const base = unir([
    c.descripcion || c.tipoServicio,
    habitaciones.get(c.habitacionId) ? `Habitación ${habitaciones.get(c.habitacionId)}` : null,
    c.incluido ? "incluido en tarifa" : plata(c.monto),
  ]);
  const eventos = [
    {
      id: `consumo-${c.id}`,
      fecha: c.fechaHora,
      tipo: "consumo",
      titulo: "Consumo cargado",
      detalle: base,
      operador: c.registradoPor ?? null,
    },
  ];
  if (c.anulado)
    eventos.push({
      id: `consumo-anulado-${c.id}`,
      // Un consumo anulado antes de que existiera anuladoEn queda con la fecha de la carga.
      fecha: c.anuladoEn ?? c.fechaHora,
      tipo: "consumo",
      titulo: "Consumo anulado",
      detalle: unir([base, c.motivoAnulacion]),
      operador: c.anuladoPor ?? null,
    });
  return eventos;
}

function eventoAjuste(n, numeroHabitacion) {
  return {
    id: `ajuste-${n.id}`,
    fecha: n.ajustadoEn,
    tipo: "precio",
    titulo: "Ajuste manual de precio",
    detalle: unir([
      `Noche del ${ddmmaaaa(n.fecha)}`,
      numeroHabitacion ? `Habitación ${numeroHabitacion}` : null,
      `${plata(n.precioOriginal)} → ${plata(n.precioNoche)}`,
      n.motivoAjuste,
    ]),
    operador: n.ajustadoPor ?? null,
  };
}

/**
 * @param {object} datos
 * @param {Array} datos.eventos        EventoEstadia
 * @param {Array} datos.personas       OcupanteReserva (id, nombre, apellido)
 * @param {Array} datos.habitaciones   [{ id, numero }] de la reserva
 * @param {Array} datos.notificaciones Notificacion
 * @param {Array} datos.pagos          PagoEstadia con medios
 * @param {Array} datos.consumos       ConsumoServicioAdicional (incluye anulados)
 * @param {Array} datos.noches         ReservaNoche ajustadas, con `habitacionNumero`
 * @returns {Array} eventos del más reciente al más antiguo
 */
function armarHistorial({ eventos = [], personas = [], habitaciones = [], notificaciones = [], pagos = [], consumos = [], noches = [] }) {
  const contexto = {
    personas: new Map(personas.map((p) => [p.id, p])),
    habitaciones: new Map(habitaciones.map((h) => [h.id, h.numero])),
  };
  const lista = [
    ...eventos.filter((e) => !ACCIONES_REPETIDAS.has(e.accion)).map((e) => eventoFicha(e, contexto)),
    ...notificaciones.map(eventoNotificacion),
    ...pagos.map(eventoPago),
    ...consumos.flatMap((c) => eventosConsumo(c, contexto.habitaciones)),
    ...noches.filter((n) => n.ajustada && n.ajustadoEn).map((n) => eventoAjuste(n, n.habitacionNumero)),
  ];
  return lista
    .map((e) => ({ ...e, fecha: new Date(e.fecha).toISOString() }))
    .sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? 1 : -1));
}

async function obtenerHistorial(reservaId, cliente = prisma) {
  const id = Number(reservaId);
  if (!Number.isSafeInteger(id) || id < 1) {
    const e = new Error("El id de la reserva no es válido.");
    e.statusCode = 400;
    throw e;
  }
  const reserva = await cliente.reserva.findUnique({
    where: { id },
    select: {
      id: true,
      reservaHabitaciones: {
        select: {
          habitacionId: true,
          habitacion: { select: { numero: true } },
          reservaNoches: { where: { ajustada: true } },
        },
      },
    },
  });
  if (!reserva) {
    const e = new Error("La reserva no existe.");
    e.statusCode = 404;
    throw e;
  }
  const [eventos, personas, notificaciones, pagos, consumos] = await Promise.all([
    cliente.eventoEstadia.findMany({ where: { reservaId: id }, orderBy: { id: "desc" }, take: LIMITE_EVENTOS }),
    cliente.ocupanteReserva.findMany({ where: { reservaId: id }, select: { id: true, nombre: true, apellido: true } }),
    cliente.notificacion.findMany({ where: { reservaId: id } }),
    cliente.pagoEstadia.findMany({ where: { reservaId: id }, include: { medios: true } }),
    cliente.consumoServicioAdicional.findMany({ where: { reservaId: id } }),
  ]);
  return armarHistorial({
    eventos,
    personas,
    habitaciones: reserva.reservaHabitaciones.map((rh) => ({ id: rh.habitacionId, numero: rh.habitacion.numero })),
    notificaciones,
    pagos,
    consumos,
    noches: reserva.reservaHabitaciones.flatMap((rh) =>
      rh.reservaNoches.map((n) => ({ ...n, precioNoche: Number(n.precioNoche), precioOriginal: Number(n.precioOriginal), habitacionNumero: rh.habitacion.numero })),
    ),
  });
}

async function getHistorial(req, res) {
  try {
    return res.json(await obtenerHistorial(req.params.id));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error("Error al armar el historial de la reserva:", err);
    return res.status(500).json({ error: "No se pudo cargar el historial de la reserva." });
  }
}

module.exports = { armarHistorial, obtenerHistorial, getHistorial };
