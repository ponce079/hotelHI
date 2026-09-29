// Reservas (HU-36 a HU-42) — alta individual/grupal, modificación,
// cancelación, disponibilidad en tiempo real, ficha del huésped,
// confirmación automática y código único.
//
// Lógica de negocio pura: no conoce HTTP y mantiene las escrituras
// relacionadas dentro de una misma transacción de Prisma (misma
// convención que habitaciones/comprobantes/pagos).
//
// Límite de responsabilidad con los otros módulos del Sprint 3:
//   - NO toca `Habitacion.estado`. Una reserva es un compromiso sobre un
//     rango de fechas futuro; "ocupada" es el estado físico de HOY y lo
//     setea el check-in (HU-47, Integrante 3). Una habitación en
//     mantenimiento esta semana puede estar perfectamente reservable para
//     el mes que viene, así que para una entrada a FUTURO la disponibilidad
//     de HU-38 sigue calculándose solo contra fechas, nunca contra `estado`
//     (a lo sumo se informa como dato de contexto, ver `estadoActual` en
//     consultarDisponibilidad). Para una entrada de HOY sí importa el
//     estado físico real — ver el comentario de consultarDisponibilidad.
//   - `marcarEnCurso` / `marcarCerrada` son los únicos puntos por donde
//     Check-in (HU-47) y Check-out (HU-48 a 52) mueven `Reserva.estado`:
//     reciben el `tx` de una transacción ya abierta por quien llama, mismo
//     patrón que ordenesCompraServicio.verificarCierrePorPagos(tx, id).

const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { enviarCorreo } = require("../../lib/correo");
const {
  ESTADO_RESERVA,
  ESTADOS_RESERVA,
  TIPOS_DOCUMENTO,
  CANALES_CONFIRMACION,
  DESTINATARIO_HUESPED,
  TIPO_NOTIFICACION_RESERVA,
  LIMITES_RESERVA,
  MAX_INTENTOS_CODIGO,
  LONGITUD_CODIGO_BYTES,
} = require("./reservas.constantes");
// HU-89: hoyComoFechaUTC vive en lib/ (no acá) porque habitaciones.servicio.js
// también la necesita, y ese import directo desde acá cerraría un ciclo de
// require — ver el comentario en lib/tipoHabitacion.js.
const { hoyComoFechaUTC, parsearFechaSinHora: parsearFechaSinHoraBase } = require("../../lib/fechas");
const { conTipoPlano } = require("../../lib/tipoHabitacion");
// Sin ciclo: pagoEstadia.constantes.js no importa nada (a diferencia de
// pagoEstadia.servicio.js, que sí forma ciclo — ver el require diferido en
// crearReservaConSena, más abajo).
const { CONCEPTO_SENIA } = require("../pagos-estadia/pagoEstadia.constantes");
// Etapa 4A (HU-95/96) — el motor de cotización es la ÚNICA fuente de
// cálculo de precio: acá nunca se calcula un importe a mano. Sin ciclo:
// cotizacion.servicio.js (y todo lo que importa, dentro de tarifas/) no
// depende de nada de reservas.
const cotizacionServicio = require("../tarifas/cotizacion.servicio");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --------------------------------------------------------------
// Helpers de validación
// --------------------------------------------------------------

function textoObligatorio(valor, campo, maximo) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw new ErrorDeNegocio(`${campo} es obligatorio.`);
  if (texto.length > maximo) throw new ErrorDeNegocio(`${campo} no puede superar los ${maximo} caracteres.`);
  return texto;
}

function textoOpcional(valor, campo, maximo) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) return null;
  if (texto.length > maximo) throw new ErrorDeNegocio(`${campo} no puede superar los ${maximo} caracteres.`);
  return texto;
}

function enteroPositivo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor a 0.`);
  return numero;
}

// Etapa 4A — `menores` de una habitación (0 a 12 años, HU-95): 0 es válido
// y es el default si no viene.
function enteroNoNegativo(valor, campo) {
  if (valor === undefined || valor === null || valor === "") return 0;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor o igual a 0.`);
  return numero;
}

// Etapa 4A — `totalEsperado` (regla 4): el total que el frontend mostró en
// la vista previa, para comparar contra el recalculado dentro de la
// transacción.
function numeroNoNegativo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) throw new ErrorDeNegocio(`${campo} debe ser un número mayor o igual a 0.`);
  return numero;
}

// Compara importes en centavos (enteros), mismo criterio que
// pagoEstadia.servicio.js — así dos totales que difieren solo por
// redondeo binario (100.10 vs 100.099999...) no disparan un 409 falso.
function centavos(n) {
  return Math.round(Number(n) * 100);
}

// `fechaDesde`/`fechaHasta` son fechas-sin-hora elegidas por el usuario en
// un <input type="date"> — se guardan como medianoche UTC del día elegido
// (mismo criterio que ComprobanteProveedor.fecha cuando es Factura). NUNCA
// new Date(valorSuelto): eso interpreta un string sin zona en la hora local
// del proceso y en Argentina (UTC-3) corre la reserva un día.
//
// Etapa 2 de tarifas por temporada (HU-90/92/93) extrajo esta lógica a
// lib/fechas.js para reutilizarla sin duplicarla — esta función queda como
// un envoltorio fino que re-lanza el Error plano de la base como el
// ErrorDeNegocio propio de este módulo (mismo patrón que
// envolverErrorReservas en checkOut.servicio.js), así los ~40 call sites
// de acá adentro no cambian.
function parsearFechaSinHora(valor, campo) {
  try {
    return parsearFechaSinHoraBase(valor, campo);
  } catch (err) {
    throw new ErrorDeNegocio(err.message);
  }
}

function mismaFecha(a, b) {
  return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
}

// Etapa 4A — misma forma que isoDeFecha en cotizacion.servicio.js (no
// exportada desde ahí), para poder cruzar una fecha guardada en
// ReservaNoche con el `fecha` (string ISO) que devuelve el detalle del
// motor por esa misma noche.
function isoDeFecha(fecha) {
  return new Date(fecha).toISOString().slice(0, 10);
}

function formatearFechaMensaje(fecha) {
  return new Date(fecha).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

function calcularNoches(fechaDesde, fechaHasta) {
  return Math.round((fechaHasta.getTime() - fechaDesde.getTime()) / MILISEGUNDOS_POR_DIA);
}

// Valida el rango de la estadía. `fechaDesdeActual` (opcional) es la fecha
// que la reserva ya tenía guardada: si no cambia, se acepta aunque sea
// pasada — si no, una reserva que arranca hoy dejaría de poder editarse
// (ej. agregarle una habitación) por una regla pensada para el alta.
function validarRango(fechaDesde, fechaHasta, fechaDesdeActual = null) {
  if (fechaHasta.getTime() <= fechaDesde.getTime()) {
    throw new ErrorDeNegocio("La fecha de salida tiene que ser posterior a la de entrada (mínimo una noche).");
  }
  const noches = calcularNoches(fechaDesde, fechaHasta);
  if (noches > LIMITES_RESERVA.nochesPorReserva) {
    // Etapa 4A: mismo mensaje que el motor de cotización (cotizarEstadia,
    // MAX_NOCHES_ESTADIA) — LIMITES_RESERVA.nochesPorReserva ya es esa
    // misma constante, así que los dos frenan exactamente en el mismo
    // punto con el mismo texto.
    throw new ErrorDeNegocio(
      `Las estadías de más de ${LIMITES_RESERVA.nochesPorReserva} noches requieren una tarifa de larga estadía: consultá con gerencia.`
    );
  }
  const hoy = hoyComoFechaUTC();
  const arranqueSinCambios = fechaDesdeActual && mismaFecha(fechaDesde, fechaDesdeActual);
  if (fechaDesde.getTime() < hoy.getTime() && !arranqueSinCambios) {
    throw new ErrorDeNegocio("La fecha de entrada no puede ser anterior a hoy.");
  }
  return noches;
}

// Etapa 4A (HU-95) — sin duplicados, tope de habitacionesPorReserva, con la
// ocupación de CADA habitación: adultos/menores se cargan por habitación,
// no para toda la reserva. El plan tarifario sí es uno solo para toda la
// reserva — viaja aparte, en normalizarAltaReserva.
function normalizarHabitacionesConOcupacion(valor) {
  const lista = Array.isArray(valor) ? valor : [];
  if (lista.length === 0) throw new ErrorDeNegocio("Hay que elegir al menos una habitación para la reserva.");
  const habitaciones = lista.map((h) => ({
    habitacionId: enteroPositivo(h?.habitacionId, "habitacionId"),
    adultos: enteroPositivo(h?.adultos, "adultos"),
    menores: enteroNoNegativo(h?.menores, "menores"),
  }));
  const idsUnicos = new Set(habitaciones.map((h) => h.habitacionId));
  if (idsUnicos.size !== habitaciones.length) {
    throw new ErrorDeNegocio("Una misma habitación no puede repetirse dentro de la reserva.");
  }
  if (habitaciones.length > LIMITES_RESERVA.habitacionesPorReserva) {
    throw new ErrorDeNegocio(`Una reserva no puede tener más de ${LIMITES_RESERVA.habitacionesPorReserva} habitaciones.`);
  }
  return habitaciones;
}

// HU-39: los campos obligatorios de la ficha del huésped se validan antes
// de confirmar la reserva, no después.
function normalizarHuesped(data) {
  if (!data || typeof data !== "object") {
    throw new ErrorDeNegocio("Faltan los datos del huésped.");
  }
  const tipoDocumento = typeof data.tipoDocumento === "string" ? data.tipoDocumento.trim() : "";
  if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    throw new ErrorDeNegocio(`tipoDocumento debe ser uno de: ${TIPOS_DOCUMENTO.join(", ")}.`);
  }
  const email = textoObligatorio(data.contacto, "El correo electrónico del huésped", LIMITES_RESERVA.contacto).toLowerCase();
  if (!PATRON_EMAIL.test(email)) {
    throw new ErrorDeNegocio("El correo electrónico del huésped no tiene un formato válido.");
  }
  return {
    nombre: textoObligatorio(data.nombre, "El nombre del huésped", LIMITES_RESERVA.nombre),
    tipoDocumento,
    numeroDocumento: textoObligatorio(data.numeroDocumento, "El número de documento", LIMITES_RESERVA.numeroDocumento),
    contacto: email,
    preferencias: textoOpcional(data.preferencias, "Las preferencias del huésped", LIMITES_RESERVA.preferencias),
  };
}

function validarCanal(valor) {
  if (valor === undefined || valor === null || valor === "") return CANALES_CONFIRMACION[0];
  const canal = String(valor).trim();
  if (!CANALES_CONFIRMACION.includes(canal)) {
    throw new ErrorDeNegocio(`canalConfirmacion debe ser uno de: ${CANALES_CONFIRMACION.join(", ")}.`);
  }
  return canal;
}

// --------------------------------------------------------------
// Forma de salida — contrato con Check-in (Integrante 3) y
// Check-out/Facturación (Integrante 4)
// --------------------------------------------------------------

// Toda lectura de una reserva sale por acá, para que la ficha, el listado
// y lo que consuman los otros módulos no puedan divergir de forma.
// `noches` se calcula al vuelo (nunca se persiste), pero el PRECIO ya no:
// desde la Etapa 4A (HU-96) cada noche de cada habitación queda congelada
// en ReservaNoche al confirmar (alta o modificación) — totalEstimadoAlojamiento
// es la suma de esas filas, no un cálculo contra la tarifa de hoy. Así, si
// mañana cambia una tarifa o se corre una actualización masiva, una
// reserva ya confirmada sigue mostrando (y cobrando en el check-out)
// exactamente lo que se vendió.
function formatearReserva(reserva) {
  if (!reserva) return null;

  const habitaciones = (reserva.reservaHabitaciones ?? [])
    .filter((rh) => rh.habitacion)
    .map((rh) => {
      const h = rh.habitacion;
      const reservaNoches = (rh.reservaNoches ?? [])
        .slice()
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
        .map((n) => ({
          fecha: n.fecha,
          temporadaId: n.temporadaId,
          temporadaNombre: n.temporada?.nombre ?? null,
          temporadaNivel: n.temporada?.nivel ?? null,
          tarifaId: n.tarifaId,
          precioNoche: Number(n.precioNoche),
          origen: n.origen,
        }));
      const subtotalAlojamiento = reservaNoches.reduce((acc, n) => acc + n.precioNoche, 0);
      return {
        id: h.id,
        numero: h.numero,
        ...conTipoPlano(h),
        capacidad: h.capacidad,
        piso: h.piso,
        estado: h.estado,
        // Etapa 4A: precio por habitación pasado a HU-95/96 (adultos/
        // menores + noches congeladas). `tarifaPorNoche` queda como dato
        // informativo de la habitación en sí (no se usa para ningún
        // cálculo nuevo) hasta que se retire en la Etapa 4C.
        tarifaPorNoche: Number(h.tarifaPorNoche),
        adultos: rh.adultos,
        menores: rh.menores,
        reservaNoches,
        subtotalAlojamiento,
        promedioPorNoche: reservaNoches.length ? subtotalAlojamiento / reservaNoches.length : 0,
      };
    });

  const noches = calcularNoches(new Date(reserva.fechaDesde), new Date(reserva.fechaHasta));
  const totalEstimadoAlojamiento = habitaciones.reduce((acc, h) => acc + h.subtotalAlojamiento, 0);

  return {
    id: reserva.id,
    codigoConfirmacion: reserva.codigoConfirmacion,
    fechaDesde: reserva.fechaDesde,
    fechaHasta: reserva.fechaHasta,
    estado: reserva.estado,
    motivoCancelacion: reserva.motivoCancelacion ?? null,
    huespedId: reserva.huespedId,
    huesped: reserva.huesped
      ? {
          id: reserva.huesped.id,
          nombre: reserva.huesped.nombre,
          tipoDocumento: reserva.huesped.tipoDocumento,
          numeroDocumento: reserva.huesped.numeroDocumento,
          contacto: reserva.huesped.contacto,
          preferencias: reserva.huesped.preferencias,
        }
      : null,
    // Etapa 4A (HU-95) — un plan tarifario por reserva. `null` solo en
    // reservas todavía no migradas a esta etapa (no debería pasar después
    // de correr el script de migración).
    planTarifarioId: reserva.planTarifarioId ?? null,
    planTarifario: reserva.planTarifario
      ? {
          id: reserva.planTarifario.id,
          codigo: reserva.planTarifario.codigo,
          nombre: reserva.planTarifario.nombre,
          tipo: reserva.planTarifario.tipo,
          reembolsable: reserva.planTarifario.reembolsable,
          horasCancelacionSinCargo: reserva.planTarifario.horasCancelacionSinCargo,
          penalidadNoShow: reserva.planTarifario.penalidadNoShow,
        }
      : null,
    habitaciones,
    // Datos derivados (no columnas): sirven para la ficha, y a Check-out
    // (HU-48) le ahorran recalcular el alojamiento al consolidar cargos.
    noches,
    cantidadHabitaciones: habitaciones.length,
    totalEstimadoAlojamiento,
    notificaciones: (reserva.notificaciones ?? []).map((n) => ({
      id: n.id,
      canal: n.canal,
      mensaje: n.mensaje,
      destinatarioArea: n.destinatarioArea,
      fechaEnvio: n.fechaEnvio,
    })),
  };
}

const INCLUDE_RESERVA = {
  huesped: true,
  planTarifario: true,
  reservaHabitaciones: {
    include: {
      habitacion: { include: { tipoHabitacion: { select: { nombre: true } } } },
      reservaNoches: { include: { temporada: { select: { nombre: true, nivel: true } } }, orderBy: { fecha: "asc" } },
    },
  },
  notificaciones: { orderBy: { fechaEnvio: "desc" } },
};

// --------------------------------------------------------------
// Disponibilidad (HU-38) — también es la validación de HU-36/37
// --------------------------------------------------------------

// Dos rangos se pisan si `desdeA < hastaB && desdeB < hastaA`. El intervalo
// es semiabierto [entrada, salida): una salida el día 5 y una entrada el
// mismo día 5 NO se solapan — es el día de rotación normal de un hotel, y
// tratarlo como conflicto perdería una noche vendible por habitación.
//
// "Confirmada" y "En curso" no se tratan igual acá (corrección posterior:
// antes ambas usaban `fechaHasta` literal, y eso deja pasar como "libre"
// una habitación cuyo huésped nunca hizo check-out):
//   - Confirmada: todavía no empezó, así que su fechaHasta es un dato
//     confiable — se usa tal cual, con el solapamiento semiabierto de
//     siempre.
//   - En curso: significa que el check-in ya ocurrió y el check-out real
//     todavía no. Su fechaHasta original es solo una previsión — si el
//     huésped se queda más de lo planeado, esa fecha queda vencida sin que
//     la habitación se haya liberado. Por eso bloquea sin techo desde su
//     propio fechaDesde: la única forma real de liberarla es `marcarCerrada`
//     (el check-out), nunca el paso del tiempo.
function condicionSolapamiento(fechaDesde, fechaHasta, excluirReservaId = null) {
  return {
    OR: [
      {
        estado: ESTADO_RESERVA.CONFIRMADA,
        fechaDesde: { lt: fechaHasta },
        fechaHasta: { gt: fechaDesde },
      },
      {
        estado: ESTADO_RESERVA.EN_CURSO,
        fechaDesde: { lt: fechaHasta },
      },
    ],
    ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
  };
}

async function buscarConflictos(cliente, { habitacionIds, fechaDesde, fechaHasta, excluirReservaId }) {
  return cliente.reservaHabitacion.findMany({
    where: {
      habitacionId: { in: habitacionIds },
      reserva: condicionSolapamiento(fechaDesde, fechaHasta, excluirReservaId),
    },
    include: {
      habitacion: { select: { id: true, numero: true } },
      reserva: { select: { id: true, codigoConfirmacion: true, fechaDesde: true, fechaHasta: true, estado: true } },
    },
  });
}

function errorPorConflictos(conflictos) {
  const detalle = conflictos
    .map(
      (c) =>
        `${c.habitacion.numero} (reserva ${c.reserva.codigoConfirmacion}, ${formatearFechaMensaje(
          c.reserva.fechaDesde
        )} al ${formatearFechaMensaje(c.reserva.fechaHasta)})`
    )
    .join("; ");
  return new ErrorDeNegocio(
    `No hay disponibilidad para el período elegido en: ${detalle}. Elegí otras fechas u otras habitaciones.`,
    409
  );
}

// Único criterio de "libre AHORA" — lo usa esta función cuando la entrada
// elegida es hoy, y también checkIn.servicio.js (HU-44/45) para el walk-in y
// la asignación manual. Nunca se reimplementa aparte: si el día de mañana
// "libre ahora" pasa a depender de algo más que `estado`, este es el único
// lugar que hay que tocar para que los dos caminos no se desincronicen.
function esLibreAhora(habitacion) {
  return habitacion.estado === "libre";
}

// HU-38 — consulta de disponibilidad usada por el alta/edición de reserva
// (HU-36/37) y reusada por el walk-in (HU-44/45, ver listarHabitacionesLibresAhora
// en checkIn.servicio.js).
//
// El estado físico de la habitación (`Habitacion.estado`) importa distinto
// según cuándo arranca la estadía consultada:
//   - Entrada HOY: la habitación tiene que estar realmente libre en este
//     momento, no solo libre "por fechas" — si está ocupada, en
//     mantenimiento, bloqueada o en limpieza, no se puede alojar a nadie
//     ahí ahora mismo, así que se excluye de los resultados.
//   - Entrada a futuro: el estado de HOY no dice nada sobre si la
//     habitación va a seguir así el día que empiece la estadía (una
//     habitación en mantenimiento esta semana puede estar libre el mes que
//     viene), así que NO se excluye — sigue siendo reservable. Se informa
//     igual como dato de contexto en `estadoActual`, para que el frontend
//     pueda mostrar un aviso ("Actualmente en mantenimiento") sin bloquear
//     la selección; no hay dato para inferir hasta cuándo va a durar ese
//     estado, así que no se intenta.
//
// `excluirReservaId` deja fuera del cálculo a una reserva puntual: es lo
// que necesita la edición (HU-37) para poder mostrar como disponibles las
// habitaciones que esa misma reserva ya tiene tomadas — si no, editarle la
// fecha de salida a una reserva haría desaparecer su propia habitación de
// la lista.
//
// `incluirOcupadas` suma el campo `todas` a la respuesta: el mismo universo
// consultado (tipo/capacidad) pero completo, con cada habitación marcando
// `disponible` y, si no lo está, un `motivo` (por qué). Por defecto no se
// pide (ni se consulta la reserva ocupante) — lo usa únicamente el paso de
// selección del wizard interno (ReservaWizard.jsx) para mostrar la grilla
// completa en vez de solo lo libre; `habitaciones` (solo disponibles) sigue
// exactamente igual para el resto de los consumidores (DisponibilidadPublicaPage.jsx,
// el propio wizard en origen "WEB").
//
// `incluirHuesped` (solo tiene efecto junto con `incluirOcupadas`) suma el
// nombre del huésped ocupante dentro de ese motivo. Este mismo endpoint es
// también la consulta PÚBLICA y sin sesión de la autorreserva (HU-38/40) —
// el nombre de otro huésped no puede viajar salvo que lo pida
// explícitamente el mostrador (ReservaWizard.jsx con origen !== "WEB"), así
// que es un parámetro aparte y no algo implícito en `incluirOcupadas`.
async function consultarDisponibilidad({
  fechaDesde,
  fechaHasta,
  tipoHabitacionId,
  capacidadMinima,
  adultos,
  menores,
  canal,
  excluirReservaId,
  incluirOcupadas,
  incluirHuesped,
} = {}) {
  const desde = parsearFechaSinHora(fechaDesde, "La fecha de entrada");
  const hasta = parsearFechaSinHora(fechaHasta, "La fecha de salida");
  const noches = validarRango(desde, hasta);

  const capacidad = capacidadMinima ? enteroPositivo(capacidadMinima, "capacidadMinima") : null;
  // HU-89: filtro por catálogo (id), ya no por el nombre-string libre de
  // antes.
  const tipoBuscado = tipoHabitacionId ? enteroPositivo(tipoHabitacionId, "tipoHabitacionId") : null;
  const excluida = excluirReservaId ? enteroPositivo(excluirReservaId, "excluirReservaId") : null;
  const entradaEsHoy = mismaFecha(desde, hoyComoFechaUTC());
  const conOcupadas = incluirOcupadas === true || incluirOcupadas === "true";
  const conHuesped = conOcupadas && (incluirHuesped === true || incluirHuesped === "true");
  // Etapa 4A (HU-95, regla 6) — ocupación buscada, para cotizar por tipo.
  // Default 2/0 (mismo default que consultarDisponibilidad usaba antes de
  // forma implícita: el precio de la habitación no dependía de ocupación).
  const adultosBuscados = adultos !== undefined && adultos !== null && adultos !== "" ? enteroPositivo(adultos, "adultos") : 2;
  const menoresBuscados = enteroNoNegativo(menores, "menores");
  const canalBuscado = canal === "WEB" ? "WEB" : "RECEPCION";

  const habitaciones = await prisma.habitacion.findMany({
    where: {
      activo: true,
      ...(tipoBuscado ? { tipoHabitacionId: tipoBuscado } : {}),
      ...(capacidad ? { capacidad: { gte: capacidad } } : {}),
    },
    include: { tipoHabitacion: { select: { nombre: true } } },
    orderBy: [{ piso: "asc" }, { numero: "asc" }],
  });

  const ocupadasPorFecha = await prisma.reservaHabitacion.findMany({
    where: {
      habitacionId: { in: habitaciones.map((h) => h.id) },
      reserva: condicionSolapamiento(desde, hasta, excluida),
    },
    select: conOcupadas
      ? {
          habitacionId: true,
          reserva: {
            select: {
              codigoConfirmacion: true,
              fechaDesde: true,
              fechaHasta: true,
              ...(conHuesped ? { huesped: { select: { nombre: true } } } : {}),
            },
          },
        }
      : { habitacionId: true },
  });
  const idsOcupadasPorFecha = new Set(ocupadasPorFecha.map((o) => o.habitacionId));
  // Primera reserva encontrada por habitación: las reglas de negocio ya
  // impiden que una misma habitación tenga dos reservas Confirmada/En curso
  // solapadas de verdad, así que en la práctica hay a lo sumo una — esto es
  // solo para no romper si algún dato quedara inconsistente.
  const reservaPorHabitacion = new Map();
  for (const o of ocupadasPorFecha) {
    if (!reservaPorHabitacion.has(o.habitacionId)) reservaPorHabitacion.set(o.habitacionId, o.reserva);
  }

  function bloqueadaAhora(h) {
    if (idsOcupadasPorFecha.has(h.id)) return true;
    return entradaEsHoy && !esLibreAhora(h);
  }

  function motivoDe(h) {
    const reserva = reservaPorHabitacion.get(h.id);
    if (reserva) {
      return {
        tipo: "reserva",
        codigoConfirmacion: reserva.codigoConfirmacion,
        fechaDesde: reserva.fechaDesde,
        fechaHasta: reserva.fechaHasta,
        huespedNombre: conHuesped ? (reserva.huesped?.nombre ?? null) : null,
      };
    }
    // Bloqueada por su propio estado físico (entrada HOY, sin una reserva
    // que la explique — ver comentario de bloqueadaAhora): mantenimiento,
    // bloqueada o en limpieza.
    return { tipo: "estado", estado: h.estado };
  }

  // Etapa 4A (HU-95, regla 6) — UNA cotización por TIPO presente (no por
  // habitación): todas las habitaciones del mismo tipo comparten el mismo
  // resultado, así que cotizarlo una vez por habitación sería trabajo
  // repetido. Si la cotización de un tipo falla (sin tarifa, estadía
  // mínima, cierre a llegadas, capacidad, más de MAX_NOCHES_ESTADIA
  // noches…), ese motivo de negocio queda en `motivoNoDisponible` para ese
  // tipo — no rompe la consulta entera, ni bloquea el resto de los tipos.
  const idsTipoPresentes = [...new Set(habitaciones.map((h) => h.tipoHabitacionId))];
  const cotizacionPorTipo = new Map();
  for (const tipoId of idsTipoPresentes) {
    try {
      const resultado = await cotizacionServicio.cotizarEstadia({
        tipoHabitacionId: tipoId,
        fechaIngreso: desde,
        fechaEgreso: hasta,
        adultos: adultosBuscados,
        menores: menoresBuscados,
        canal: canalBuscado,
      });
      cotizacionPorTipo.set(tipoId, {
        planes: resultado.planes,
        estadiaMinimaExigida: resultado.estadiaMinimaExigida,
        motivoNoDisponible: null,
      });
    } catch (err) {
      if (err instanceof cotizacionServicio.ErrorDeNegocio) {
        cotizacionPorTipo.set(tipoId, { planes: [], estadiaMinimaExigida: null, motivoNoDisponible: err.message });
      } else {
        throw err;
      }
    }
  }

  const disponibles = [];
  const todas = conOcupadas ? [] : undefined;

  for (const h of habitaciones) {
    const bloqueada = bloqueadaAhora(h);
    const cotizacion = cotizacionPorTipo.get(h.tipoHabitacionId);
    const base = {
      id: h.id,
      numero: h.numero,
      ...conTipoPlano(h),
      capacidad: h.capacidad,
      piso: h.piso,
      equipamiento: h.equipamiento,
      estado: h.estado,
      // Informativo, nunca excluyente (ver comentario de arriba): queda en
      // null salvo que la habitación no esté libre en este momento — con
      // entrada HOY esas ya se filtraron arriba, así que en la práctica solo
      // se completa para una entrada a futuro.
      estadoActual: esLibreAhora(h) ? null : h.estado,
      // Etapa 4A: reemplaza tarifaPorNoche/totalEstadia — el precio sale
      // siempre del motor, por plan (total y promedio por noche de CADA
      // plan disponible para el canal pedido, no un solo número).
      planes: cotizacion.planes,
      estadiaMinimaExigida: cotizacion.estadiaMinimaExigida,
      motivoNoDisponible: cotizacion.motivoNoDisponible,
    };
    if (!bloqueada) disponibles.push(base);
    if (conOcupadas) todas.push({ ...base, disponible: !bloqueada, motivo: bloqueada ? motivoDe(h) : null });
  }

  // Resumen por tipo sobre el universo consultado (no solo lo disponible):
  // "Doble: 2 de 6 libres" es la lectura que pide HU-38, y con solo la
  // lista de libres no se puede saber el denominador. HU-89: agrupa por
  // tipoHabitacionId (antes era por el string h.tipo) — si dos variantes
  // de texto distintas se fusionaron en el mismo TipoHabitacion durante la
  // migración, acá van a aparecer como un solo grupo, que es lo correcto
  // (ya eran el mismo tipo, mal tipeado antes). Sigue devolviendo `tipo`
  // (el nombre) para no romper a los consumidores de frontend que ya lo
  // leen como texto, sumando `tipoHabitacionId` para quien filtre por id.
  const resumenPorTipo = idsTipoPresentes
    .map((id) => {
      const delTipo = habitaciones.filter((h) => h.tipoHabitacionId === id);
      const libres = delTipo.filter((h) => !bloqueadaAhora(h));
      const cotizacion = cotizacionPorTipo.get(id);
      // Etapa 4A: tarifaDesde pasa a ser el menor promedio-por-noche entre
      // los planes en alcance (regla 6) — antes era el mínimo tarifaPorNoche
      // plano entre las habitaciones libres.
      const tarifaDesde = cotizacion.planes.length ? Math.min(...cotizacion.planes.map((p) => p.promedioPorNoche)) : null;
      return {
        tipoHabitacionId: id,
        tipo: delTipo[0]?.tipoHabitacion?.nombre ?? null,
        total: delTipo.length,
        disponibles: libres.length,
        tarifaDesde,
        planes: cotizacion.planes,
        motivoNoDisponible: cotizacion.motivoNoDisponible,
        capacidadMaxima: delTipo.length ? Math.max(...delTipo.map((h) => h.capacidad)) : null,
      };
    })
    .sort((a, b) => (a.tipo ?? "").localeCompare(b.tipo ?? ""));

  return {
    fechaDesde: desde,
    fechaHasta: hasta,
    noches,
    habitaciones: disponibles,
    resumenPorTipo,
    ...(conOcupadas ? { todas } : {}),
  };
}

// --------------------------------------------------------------
// Alta (HU-36, HU-39, HU-41, HU-42)
// --------------------------------------------------------------

function generarCodigoConfirmacion() {
  return crypto.randomBytes(LONGITUD_CODIGO_BYTES).toString("hex").toUpperCase();
}

// HU-42. `numeracion.js` (crearConNumeroSecuencial) NO sirve acá: genera
// correlativos tipo OP-00001 derivados del id, y el criterio de aceptación
// pide un código alfanumérico no adivinable.
async function reservarCodigoLibre(tx) {
  for (let intento = 0; intento < MAX_INTENTOS_CODIGO; intento += 1) {
    const candidato = generarCodigoConfirmacion();
    const tomado = await tx.reserva.findUnique({ where: { codigoConfirmacion: candidato }, select: { id: true } });
    if (!tomado) return candidato;
  }
  throw new ErrorDeNegocio("No se pudo generar un código de confirmación único, intentá de nuevo.", 503);
}

// La ficha del huésped es una tabla aparte de Reserva a propósito (deja
// lugar a la épica "Gestión de Huéspedes" con historial cross-reserva), así
// que el mismo documento no se duplica: si ya existe, se reutiliza la fila
// y se completan los datos que hayan cambiado. El par (tipoDocumento,
// numeroDocumento) no tiene @@unique en la base — el schema está congelado
// y nadie lo toca sin avisar al grupo — así que la búsqueda es por findFirst
// y la unicidad es best-effort, no una garantía del motor.
async function resolverHuesped(tx, datos) {
  const existente = await tx.huesped.findFirst({
    where: { tipoDocumento: datos.tipoDocumento, numeroDocumento: datos.numeroDocumento },
  });
  if (!existente) return tx.huesped.create({ data: datos });

  // Solo se pisan los campos con valor nuevo: un alta que no repite el
  // contacto no tiene que borrar el que ya estaba cargado.
  return tx.huesped.update({
    where: { id: existente.id },
    data: {
      nombre: datos.nombre,
      contacto: datos.contacto ?? existente.contacto,
      preferencias: datos.preferencias ?? existente.preferencias,
    },
  });
}

// HU-41. No hay proveedor de email/SMS configurado en el proyecto (misma
// "limitación conocida" que la validación de pago mockeada de HU-46), así
// que el envío se modela como el registro en Notificacion que pide el
// criterio de aceptación ("queda un registro del envío"), sin integración
// real. Sin datos de contacto cargados no se puede fingir un envío: queda
// como aviso interno para el mostrador.
function armarNotificacionConfirmacion({ reserva, huesped, habitaciones, origen }) {
  const numeros = habitaciones.map((h) => h.numero).join(", ");
  const periodo = `${formatearFechaMensaje(reserva.fechaDesde)} al ${formatearFechaMensaje(reserva.fechaHasta)}`;
  const base =
    `Reserva ${reserva.codigoConfirmacion} confirmada para ${huesped.nombre}: ` +
    `habitación/es ${numeros}, del ${periodo}` +
    (origen === "WEB" ? " (reserva web autogestionada)." : ".");

  return {
    tipo: TIPO_NOTIFICACION_RESERVA,
    reservaId: reserva.id,
    canal: "Email",
    destinatarioArea: DESTINATARIO_HUESPED,
    mensaje: `${base} Destinada a ${huesped.contacto}.`,
  };
}

function escaparHTML(valor) {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function enviarConfirmacionPorEmail(reserva) {
  const huesped = reserva.huesped;
  const habitaciones = (reserva.reservaHabitaciones ?? []).map((rh) => rh.habitacion).filter(Boolean);
  const numeros = habitaciones.map((h) => h.numero).join(", ");
  const periodo = `${formatearFechaMensaje(reserva.fechaDesde)} al ${formatearFechaMensaje(reserva.fechaHasta)}`;
  const texto =
    `Hola ${huesped.nombre},\n\n` +
    `tu reserva en Holiday Inn fue confirmada.\n` +
    `Código de confirmación: ${reserva.codigoConfirmacion}\n` +
    `Habitación/es: ${numeros}\n` +
    `Estadía: ${periodo}\n\n` +
    "Presentá el código de confirmación al realizar el check-in.";

  return enviarCorreo({
    para: huesped.contacto,
    asunto: `Reserva confirmada · ${reserva.codigoConfirmacion}`,
    texto,
    html: `
      <div style="font-family:Arial,sans-serif;color:#1b1a16;line-height:1.5">
        <h2 style="color:#1f4d3a">Reserva confirmada</h2>
        <p>Hola <strong>${escaparHTML(huesped.nombre)}</strong>, tu reserva en Holiday Inn fue confirmada.</p>
        <p style="font-size:18px"><strong>Código: ${escaparHTML(reserva.codigoConfirmacion)}</strong></p>
        <p>Habitación/es: ${escaparHTML(numeros)}<br>Estadía: ${escaparHTML(periodo)}</p>
        <p>Presentá este código al realizar el check-in.</p>
      </div>`,
  });
}

function normalizarAltaReserva(data) {
  const fechaDesde = parsearFechaSinHora(data?.fechaDesde, "La fecha de entrada");
  const fechaHasta = parsearFechaSinHora(data?.fechaHasta, "La fecha de salida");
  validarRango(fechaDesde, fechaHasta);
  return {
    fechaDesde,
    fechaHasta,
    // Etapa 4A (HU-95/96): ocupación por habitación + un plan tarifario
    // para toda la reserva + el total que el frontend mostró en la vista
    // previa (se recalcula y se compara adentro de la transacción).
    habitaciones: normalizarHabitacionesConOcupacion(data?.habitaciones),
    planTarifarioId: enteroPositivo(data?.planTarifarioId, "planTarifarioId"),
    totalEsperado: numeroNoNegativo(data?.totalEsperado, "totalEsperado"),
    huesped: normalizarHuesped(data?.huesped),
    canalConfirmacion: validarCanal(data?.canalConfirmacion),
    // HU-40: el canal web reutiliza este mismo alta sin duplicar lógica.
    // No hay columna para el origen (el schema está congelado), así que
    // solo matiza el texto de la notificación — y ahora también decide el
    // `canal` que le llega al motor de cotización (visibleWeb o no).
    origen: data?.origen === "WEB" ? "WEB" : "RECEPCION",
  };
}

// Envoltorio fino (mismo patrón que el resto del proyecto — ver
// envolverErrorReservas en checkOut.servicio.js): cotizacion.servicio.js
// tiene su propia clase ErrorDeNegocio; sin traducirla acá, el controlador
// de reservas la trataría como un error inesperado (500) en vez de
// devolver el mensaje real (precio cambiado, plan no disponible, capacidad,
// estadía mínima, etc.) con su status code.
async function cotizarReservaEnvuelto(datos, cliente) {
  try {
    return await cotizacionServicio.cotizarReserva(datos, cliente);
  } catch (err) {
    if (err instanceof cotizacionServicio.ErrorDeNegocio) {
      throw new ErrorDeNegocio(err.message, err.statusCode);
    }
    throw err;
  }
}

// HU-95 (regla 5) — cotización previa a confirmar un alta o una
// modificación, para el mostrador y para la web. Mismo payload que el
// alta pero sin `totalEsperado` (acá no hay nada que comparar todavía) y
// SIN leer `fechaVenta` del body nunca: la fecha de venta es siempre HOY
// del servidor — aceptar una del cliente dejaría cotizar con una fecha de
// venta falsa para esquivar un aumento ya vigente.
async function cotizarParaReserva(data) {
  const fechaDesde = parsearFechaSinHora(data?.fechaDesde, "La fecha de entrada");
  const fechaHasta = parsearFechaSinHora(data?.fechaHasta, "La fecha de salida");
  validarRango(fechaDesde, fechaHasta);
  const habitaciones = normalizarHabitacionesConOcupacion(data?.habitaciones);
  const planTarifarioId =
    data?.planTarifarioId === undefined || data?.planTarifarioId === null || data?.planTarifarioId === ""
      ? undefined
      : enteroPositivo(data.planTarifarioId, "planTarifarioId");
  const canal = data?.canal === "WEB" ? "WEB" : "RECEPCION";

  return cotizarReservaEnvuelto(
    { fechaDesde, fechaHasta, planTarifarioId, habitaciones, canal, fechaVenta: hoyComoFechaUTC() },
    prisma
  );
}

// Núcleo transaccional del alta. Público aparte de `crearReserva` para que
// Check-in (HU-44, walk-in) pueda crear la reserva DENTRO de su propia
// transacción, en vez de tener que reimplementar esta lógica.
async function crearReservaEnTransaccion(tx, datos) {
  const { fechaDesde, fechaHasta, habitaciones, planTarifarioId, totalEsperado, huesped, origen } = datos;
  const habitacionIds = habitaciones.map((h) => h.habitacionId);

  const habitacionesDb = await tx.habitacion.findMany({ where: { id: { in: habitacionIds } } });
  if (habitacionesDb.length !== habitacionIds.length) {
    throw new ErrorDeNegocio("Alguna de las habitaciones elegidas no existe.", 404);
  }
  const dadasDeBaja = habitacionesDb.filter((h) => !h.activo);
  if (dadasDeBaja.length > 0) {
    throw new ErrorDeNegocio(
      `No se puede reservar una habitación dada de baja: ${dadasDeBaja.map((h) => h.numero).join(", ")}.`
    );
  }

  // Re-chequeo protegido contra carreras: sin esto, dos altas simultáneas
  // sobre la misma habitación leen las dos "está libre" y se cuelan las
  // dos. La fila que habría que bloquear todavía no existe, así que un
  // SELECT normal no alcanza — FOR UPDATE sobre el índice de habitacionId
  // toma gap locks bajo REPEATABLE READ (default de InnoDB) y hace que la
  // segunda transacción espere a que ésta commitee. Mismo razonamiento que
  // el lock de cheques en pagos.servicio.js.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM reservas_habitaciones WHERE habitacionId IN (${Prisma.join(habitacionIds)}) FOR UPDATE`
  );

  const conflictos = await buscarConflictos(tx, { habitacionIds, fechaDesde, fechaHasta });
  if (conflictos.length > 0) throw errorPorConflictos(conflictos);

  // HU-95/96 (Etapa 4A) — el precio SIEMPRE sale del motor, recalculado
  // acá adentro (con `tx`, para que vea exactamente lo que esta misma
  // transacción ya validó) y comparado contra lo que el frontend mostró en
  // la vista previa. Si difiere (alguien cambió una tarifa mientras el
  // recepcionista tenía la pantalla abierta), se rechaza toda la
  // operación — no se cobra ni un centavo distinto de lo que el huésped
  // vio.
  const canal = origen === "WEB" ? "WEB" : "RECEPCION";
  const cotizacion = await cotizarReservaEnvuelto(
    { fechaDesde, fechaHasta, planTarifarioId, habitaciones, canal, fechaVenta: hoyComoFechaUTC() },
    tx
  );
  const plan = cotizacion.planes[0];
  if (!plan) {
    throw new ErrorDeNegocio("El plan tarifario elegido no está disponible para este canal.");
  }
  if (centavos(plan.total) !== centavos(totalEsperado)) {
    throw new ErrorDeNegocio(
      `El precio cambió desde la cotización: antes $${totalEsperado}, ahora $${plan.total}. Volvé a cotizar.`,
      409
    );
  }

  const huespedGuardado = await resolverHuesped(tx, huesped);
  const codigoConfirmacion = await reservarCodigoLibre(tx);

  const reserva = await tx.reserva.create({
    data: {
      huespedId: huespedGuardado.id,
      fechaDesde,
      fechaHasta,
      estado: ESTADO_RESERVA.CONFIRMADA,
      codigoConfirmacion,
      planTarifarioId,
      reservaHabitaciones: {
        create: habitaciones.map((h) => ({ habitacionId: h.habitacionId, adultos: h.adultos, menores: h.menores })),
      },
    },
    include: { reservaHabitaciones: true },
  });

  // Precio congelado por noche (HU-96) — una ReservaNoche por habitación y
  // noche, con el detalle que ya calculó cotizarReserva arriba. Loop
  // aparte (no nested-create de 2 niveles): más simple, y sin sorpresas en
  // el doble de Prisma de los tests, que solo sabe expandir un nivel de
  // relación anidada.
  const reservaHabitacionIdPorHabitacion = new Map(reserva.reservaHabitaciones.map((rh) => [rh.habitacionId, rh.id]));
  for (const habitacionPlan of plan.habitaciones) {
    const reservaHabitacionId = reservaHabitacionIdPorHabitacion.get(habitacionPlan.habitacionId);
    for (const noche of habitacionPlan.detalle) {
      await tx.reservaNoche.create({
        data: {
          reservaHabitacionId,
          fecha: parsearFechaSinHora(noche.fecha, "fecha"),
          temporadaId: noche.temporadaId,
          tarifaId: noche.tarifaId,
          planTarifarioId,
          precioNoche: noche.precioNoche,
          origen: "MOTOR",
        },
      });
    }
  }

  await tx.notificacion.create({
    data: armarNotificacionConfirmacion({
      reserva,
      huesped: huespedGuardado,
      habitaciones: habitacionesDb,
      origen,
    }),
  });

  return tx.reserva.findUnique({ where: { id: reserva.id }, include: INCLUDE_RESERVA });
}

// HU-36 — alta individual o grupal (una fila ReservaHabitacion por
// habitación asociada). Es el mismo camino para la carga del recepcionista
// y para el autoservicio web de HU-40.
async function crearReserva(data) {
  const datos = normalizarAltaReserva(data);

  // Chequeo rápido antes de abrir la transacción: buena UX (responde sin
  // tomar locks si el pedido ya está mal), no es lo que protege contra la
  // carrera — eso pasa de nuevo, con las filas bloqueadas, adentro.
  const conflictosPrevios = await buscarConflictos(prisma, {
    habitacionIds: datos.habitaciones.map((h) => h.habitacionId),
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
  });
  if (conflictosPrevios.length > 0) throw errorPorConflictos(conflictosPrevios);

  // Reintento del alta completa ante una colisión de `codigoConfirmacion`:
  // la transacción ya queda abortada cuando Prisma tira P2002, así que no
  // alcanza con generar otro código adentro — hay que rehacerla entera.
  // En la práctica no debería entrar nunca al segundo intento.
  let ultimoError;
  for (let intento = 0; intento < MAX_INTENTOS_CODIGO; intento += 1) {
    try {
      const reserva = await prisma.$transaction((tx) => crearReservaEnTransaccion(tx, datos), {
        timeout: 15000,
        maxWait: 10000,
      });
      const confirmacionEmail = await enviarConfirmacionPorEmail(reserva);
      return { ...formatearReserva(reserva), confirmacionEmail };
    } catch (err) {
      const esCodigoDuplicado =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        String(err.meta?.target ?? "").includes("codigoConfirmacion");
      if (!esCodigoDuplicado) throw err;
      ultimoError = err;
    }
  }
  console.error("[reservas] Colisión repetida de codigoConfirmacion:", ultimoError);
  throw new ErrorDeNegocio("No se pudo generar un código de confirmación único, intentá de nuevo.", 503);
}

// HU-88 (extensión de HU-36) — alta de reserva CON seña, como una única
// operación atómica.
//
// Antes esto eran 2 llamadas HTTP separadas (crearReserva y luego
// pagoEstadia.crearPago) con la Reserva ya "Confirmada" en el medio: si el
// cobro de la seña fallaba (tarjeta rechazada) o el recepcionista cerraba
// el modal antes de terminar, quedaba una Reserva huérfana sin seña,
// bloqueando la habitación — no hay ningún job que la detecte ni la
// limpie. Envolver alta + cobro en una sola transacción de Prisma hace que
// ese estado intermedio deje de ser posible: si el cobro falla en
// cualquier punto, Prisma revierte TODO, incluida la Reserva recién creada.
//
// No reimplementa nada: reusa crearReservaEnTransaccion tal cual (mismo
// código que usa el alta sin seña y el walk-in de Check-in) y
// pagoEstadia.crearPagoEnTransaccion tal cual (mismo código que usa el
// cobro de HU-50) — lo único nuevo acá es que corren dentro de la MISMA
// transacción en vez de en dos llamadas separadas.
//
// Require diferido, mismo motivo que en cancelarReserva: pagoEstadia.
// servicio.js importa checkOut.servicio.js, que importa este archivo — un
// require al tope formaría un ciclo.
async function crearReservaConSena(data) {
  const datos = normalizarAltaReserva(data);
  const pagoEstadiaServicio = require("../pagos-estadia/pagoEstadia.servicio");

  // Chequeo rápido antes de abrir la transacción, mismo criterio (y mismos
  // límites) que crearReserva: buena UX, no es lo que protege contra la
  // carrera.
  const conflictosPrevios = await buscarConflictos(prisma, {
    habitacionIds: datos.habitaciones.map((h) => h.habitacionId),
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
  });
  if (conflictosPrevios.length > 0) throw errorPorConflictos(conflictosPrevios);

  // Mismo reintento ante colisión de codigoConfirmacion que crearReserva:
  // rehacer TODO (reserva + seña) es seguro porque nada quedó persistido en
  // el intento fallido — la transacción entera se revirtió.
  let ultimoError;
  for (let intento = 0; intento < MAX_INTENTOS_CODIGO; intento += 1) {
    try {
      const { reserva, pago } = await prisma.$transaction(
        async (tx) => {
          const reservaCreada = await crearReservaEnTransaccion(tx, datos);
          // Sin lock explícito acá (a diferencia de crearPago): la reserva
          // recién se creó DENTRO de esta misma transacción, todavía no
          // existe para nadie más — no hay ninguna otra transacción que
          // pueda estar disputando su saldo.
          let pagoCreado;
          try {
            pagoCreado = await pagoEstadiaServicio.crearPagoEnTransaccion(tx, {
              reservaId: reservaCreada.id,
              medios: data?.medios,
              concepto: CONCEPTO_SENIA,
            });
          } catch (err) {
            // El ErrorDeNegocio de pagoEstadia es OTRA clase (mismo caso que
            // calcularSaldoReserva reenvolviendo el de checkOut, en
            // pagoEstadia.servicio.js): sin traducirlo acá, el controlador
            // de reservas lo trataría como error inesperado (500) en vez de
            // devolver el mensaje real de la validación (tarjeta sin
            // referencia, importe inválido, etc.) con su status code.
            if (err instanceof pagoEstadiaServicio.ErrorDeNegocio) {
              throw new ErrorDeNegocio(err.message, err.statusCode);
            }
            throw err;
          }
          return { reserva: reservaCreada, pago: pagoCreado };
        },
        { timeout: 15000, maxWait: 10000 }
      );

      const confirmacionEmail = await enviarConfirmacionPorEmail(reserva);
      return { ...formatearReserva(reserva), confirmacionEmail, pagoSenia: pago };
    } catch (err) {
      const esCodigoDuplicado =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        String(err.meta?.target ?? "").includes("codigoConfirmacion");
      if (!esCodigoDuplicado) throw err;
      ultimoError = err;
    }
  }
  console.error("[reservas] Colisión repetida de codigoConfirmacion:", ultimoError);
  throw new ErrorDeNegocio("No se pudo generar un código de confirmación único, intentá de nuevo.", 503);
}

// --------------------------------------------------------------
// Lectura (contrato con Integrantes 3 y 4)
// --------------------------------------------------------------

async function obtenerReserva(id) {
  const reservaId = enteroPositivo(id, "id");
  const reserva = await prisma.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  if (!reserva) throw new ErrorDeNegocio("La reserva no existe.", 404);
  return formatearReserva(reserva);
}

// Check-in (HU-43) busca por el código que trae el huésped, no por id.
async function obtenerPorCodigoConfirmacion(codigo) {
  const buscado = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
  if (!buscado) throw new ErrorDeNegocio("El código de confirmación es obligatorio.");
  const reserva = await prisma.reserva.findUnique({
    where: { codigoConfirmacion: buscado },
    include: INCLUDE_RESERVA,
  });
  if (!reserva) throw new ErrorDeNegocio(`No existe una reserva con el código ${buscado}.`, 404);
  return formatearReserva(reserva);
}

// Check-in — el mostrador tiene el código de confirmación O el documento
// del huésped, nunca los dos a la vez, así que es un único campo: primero
// prueba como código exacto (formato propio, ver generarCodigoConfirmacion)
// y si no matchea nada, cae a documento del huésped (cualquier tipo, no
// solo DNI — mismo `numeroDocumento` de texto libre que ya usa el alta de
// Reservas, sin asumir formato). `numeroDocumento: buscado` sin envolver en
// `{ contains }` es igualdad exacta (mismo criterio que Prisma resuelve un
// campo plano) — a propósito, distinto del buscador de /reservas (que sí
// usa `contains` porque ahí se sugieren candidatos de un listado): acá hay
// que identificar a UNA persona puntual, un documento que sea substring de
// otro no puede traer la reserva ajena.
//
// Con el mismo documento puede haber más de una reserva (histórico).
// Orden = fechaDesde desc, id desc como desempate. Dos casos:
//   - Ninguna puede iniciar check-in todavía: se muestra la primera del
//     orden (la de fechaDesde más reciente) para que el motivo de bloqueo
//     sea el más relevante, no el de un registro viejo al azar.
//   - Dos o más SÍ califican a la vez (ambas Confirmada y ya vigentes): se
//     queda con la de fechaDesde más reciente — la ventana de estadía más
//     cercana a hoy es la más probable de ser la visita actual, no una
//     Confirmada vieja que nunca se canceló ni se registró. Si empatan en
//     fechaDesde (mismo día), gana la de id más alto (la creada después).
async function obtenerPorCodigoODocumento(termino) {
  const buscado = typeof termino === "string" ? termino.trim() : "";
  if (!buscado) throw new ErrorDeNegocio("Indicá el código de confirmación o el documento del huésped.");

  const porCodigo = await prisma.reserva.findUnique({
    where: { codigoConfirmacion: buscado.toUpperCase() },
    include: INCLUDE_RESERVA,
  });
  if (porCodigo) return formatearReserva(porCodigo);

  const candidatas = await prisma.reserva.findMany({
    where: { huesped: { numeroDocumento: buscado } },
    include: INCLUDE_RESERVA,
    orderBy: [{ fechaDesde: "desc" }, { id: "desc" }],
  });
  if (candidatas.length === 0) {
    throw new ErrorDeNegocio(`No existe una reserva con el código o documento "${buscado}".`, 404);
  }
  const vigente = candidatas.find((r) => r.estado === ESTADO_RESERVA.CONFIRMADA);
  return formatearReserva(vigente ?? candidatas[0]);
}

async function listarReservas({ q, estado, desde, hasta, habitacionId } = {}) {
  if (estado && !ESTADOS_RESERVA.includes(estado)) {
    throw new ErrorDeNegocio(`estado debe ser uno de: ${ESTADOS_RESERVA.join(", ")}.`);
  }
  const texto = typeof q === "string" ? q.trim() : "";
  // Filtro por período: trae las reservas que se pisan con el rango
  // pedido, no solo las que empiezan adentro — si no, una estadía larga
  // desaparece de la vista del día en que está en curso.
  const fechaDesdeFiltro = desde ? parsearFechaSinHora(desde, "El filtro de fecha desde") : null;
  const fechaHastaFiltro = hasta ? parsearFechaSinHora(hasta, "El filtro de fecha hasta") : null;

  const reservas = await prisma.reserva.findMany({
    where: {
      ...(estado ? { estado } : {}),
      ...(fechaHastaFiltro ? { fechaDesde: { lte: fechaHastaFiltro } } : {}),
      ...(fechaDesdeFiltro ? { fechaHasta: { gte: fechaDesdeFiltro } } : {}),
      ...(habitacionId
        ? { reservaHabitaciones: { some: { habitacionId: enteroPositivo(habitacionId, "habitacionId") } } }
        : {}),
      ...(texto
        ? {
            OR: [
              { codigoConfirmacion: { contains: texto } },
              { huesped: { nombre: { contains: texto } } },
              { huesped: { numeroDocumento: { contains: texto } } },
              { reservaHabitaciones: { some: { habitacion: { numero: { contains: texto } } } } },
            ],
          }
        : {}),
    },
    include: INCLUDE_RESERVA,
    orderBy: [{ fechaDesde: "desc" }, { id: "desc" }],
  });

  return reservas.map(formatearReserva);
}

// --------------------------------------------------------------
// Modificación y cancelación (HU-37)
// --------------------------------------------------------------

// Solo se toca una reserva que todavía no arrancó: con el huésped ya
// alojado (En curso) los cambios son check-out/facturación, y una Cerrada
// o Cancelada es historia.
function exigirModificable(reserva) {
  if (reserva.estado !== ESTADO_RESERVA.CONFIRMADA) {
    throw new ErrorDeNegocio(
      `Solo se puede modificar una reserva en estado "${ESTADO_RESERVA.CONFIRMADA}" (ésta está "${reserva.estado}").`
    );
  }
}

// Etapa 4A (HU-96, regla 9) — el precio se recalcula noche por noche: una
// noche que conserva exactamente la misma habitación, fecha, ocupación y
// plan que ya tenía mantiene el precio congelado; el resto (fechas nuevas,
// habitaciones nuevas o una ocupación distinta) se recotiza con el motor.
// `data.soloPrevia === true` hace todo el cálculo (incluida la validación
// de conflictos) sin escribir nada — para que la pantalla muestre
// `{totalAnterior, totalNuevo, diferencia}` ANTES de que el recepcionista
// confirme.
//
// Ajuste B (plan no reembolsable): un cambio de ocupación que baja el
// precio de una noche que ya existía NO se aplica — se conserva el precio
// anterior de esa noche, porque una tarifa no reembolsable no tiene
// devolución. Si el cambio de ocupación sube el precio, se recotiza normal.
async function modificarReserva(id, data) {
  const reservaId = enteroPositivo(id, "id");
  const actual = await prisma.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  if (!actual) throw new ErrorDeNegocio("La reserva no existe.", 404);
  exigirModificable(actual);

  const planActualId = actual.planTarifarioId;
  const planActualEsNoReembolsable = actual.planTarifario?.reembolsable === false;

  const nuevoFechaDesde =
    data?.fechaDesde === undefined ? null : parsearFechaSinHora(data.fechaDesde, "La fecha de entrada");
  const nuevoFechaHasta =
    data?.fechaHasta === undefined ? null : parsearFechaSinHora(data.fechaHasta, "La fecha de salida");
  const nuevoPlanTarifarioId =
    data?.planTarifarioId === undefined ? planActualId : enteroPositivo(data.planTarifarioId, "planTarifarioId");

  const cambiaFechaDesde = nuevoFechaDesde !== null && !mismaFecha(nuevoFechaDesde, new Date(actual.fechaDesde));
  const cambiaFechaHasta = nuevoFechaHasta !== null && !mismaFecha(nuevoFechaHasta, new Date(actual.fechaHasta));
  const cambiaPlan = nuevoPlanTarifarioId !== planActualId;

  // Regla 9 — un plan no reembolsable no admite cambiar fechas ni plan: no
  // hay margen para recotizar más barato una tarifa que ya se vendió sin
  // devolución.
  if (planActualEsNoReembolsable && (cambiaFechaDesde || cambiaFechaHasta || cambiaPlan)) {
    throw new ErrorDeNegocio("Las reservas con tarifa no reembolsable no admiten cambios de fechas ni de plan.");
  }

  const fechaDesde = nuevoFechaDesde ?? new Date(actual.fechaDesde);
  const fechaHasta = nuevoFechaHasta ?? new Date(actual.fechaHasta);
  validarRango(fechaDesde, fechaHasta, new Date(actual.fechaDesde));

  const habitaciones =
    data?.habitaciones === undefined
      ? actual.reservaHabitaciones.map((rh) => ({ habitacionId: rh.habitacionId, adultos: rh.adultos, menores: rh.menores }))
      : normalizarHabitacionesConOcupacion(data.habitaciones);
  const habitacionIds = habitaciones.map((h) => h.habitacionId);

  // El huésped solo se toca si vino en el payload. Si cambia el documento,
  // la reserva pasa a apuntar a otra ficha (un documento distinto es otra
  // persona) en vez de renombrar la del huésped original, que puede tener
  // otras reservas colgando.
  const huesped = data?.huesped === undefined ? null : normalizarHuesped(data.huesped);
  const soloPrevia = data?.soloPrevia === true;

  // Snapshot de lo que la reserva YA tenía congelado (por habitación y por
  // noche), para decidir noche por noche qué conserva precio y qué se
  // recotiza.
  const snapshotPorHabitacion = new Map(
    actual.reservaHabitaciones.map((rh) => [
      rh.habitacionId,
      {
        adultos: rh.adultos,
        menores: rh.menores,
        noches: new Map(rh.reservaNoches.map((n) => [isoDeFecha(n.fecha), n])),
      },
    ])
  );
  const totalAnterior = actual.reservaHabitaciones.reduce(
    (acc, rh) => acc + rh.reservaNoches.reduce((a, n) => a + Number(n.precioNoche), 0),
    0
  );

  const ejecutar = async (tx) => {
    const habitacionesDb = await tx.habitacion.findMany({ where: { id: { in: habitacionIds } } });
    if (habitacionesDb.length !== habitacionIds.length) {
      throw new ErrorDeNegocio("Alguna de las habitaciones elegidas no existe.", 404);
    }
    const dadasDeBaja = habitacionesDb.filter((h) => !h.activo);
    if (dadasDeBaja.length > 0) {
      throw new ErrorDeNegocio(
        `No se puede reservar una habitación dada de baja: ${dadasDeBaja.map((h) => h.numero).join(", ")}.`
      );
    }

    // El lock preventivo contra carreras solo hace falta cuando esto va a
    // escribir: una vista previa no reserva nada, así que no vale la pena
    // tomar gap locks que podrían pisarse con otra vista previa concurrente.
    if (!soloPrevia) {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM reservas_habitaciones WHERE habitacionId IN (${Prisma.join(habitacionIds)}) FOR UPDATE`
      );
    }

    const conflictos = await buscarConflictos(tx, {
      habitacionIds,
      fechaDesde,
      fechaHasta,
      excluirReservaId: reservaId,
    });
    if (conflictos.length > 0) throw errorPorConflictos(conflictos);

    const cotizacion = await cotizarReservaEnvuelto(
      { fechaDesde, fechaHasta, planTarifarioId: nuevoPlanTarifarioId, habitaciones, canal: "RECEPCION", fechaVenta: hoyComoFechaUTC() },
      tx
    );
    const plan = cotizacion.planes[0];
    if (!plan) throw new ErrorDeNegocio("El plan tarifario elegido no está disponible para este canal.");

    let huboReduccionNoReembolsable = false;
    const nochesPorHabitacion = new Map();
    for (const habitacionPlan of plan.habitaciones) {
      const anterior = snapshotPorHabitacion.get(habitacionPlan.habitacionId);
      const mismaOcupacion = Boolean(
        anterior && anterior.adultos === habitacionPlan.adultos && anterior.menores === habitacionPlan.menores
      );
      const noches = habitacionPlan.detalle.map((noche) => {
        const nocheAnterior = anterior?.noches.get(noche.fecha);
        // Misma habitación + misma fecha + misma ocupación + mismo plan:
        // conserva el precio congelado que ya tenía.
        if (nocheAnterior && mismaOcupacion && !cambiaPlan) {
          return {
            fecha: noche.fecha,
            temporadaId: nocheAnterior.temporadaId,
            tarifaId: nocheAnterior.tarifaId,
            precioNoche: Number(nocheAnterior.precioNoche),
            origen: nocheAnterior.origen,
          };
        }
        // Ajuste B: ocupación distinta en un plan no reembolsable, y el
        // motor da un precio MENOR al que ya tenía esa noche → no se
        // aplica la baja, se conserva el precio anterior.
        if (nocheAnterior && !mismaOcupacion && planActualEsNoReembolsable && noche.precioNoche < Number(nocheAnterior.precioNoche)) {
          huboReduccionNoReembolsable = true;
          return {
            fecha: noche.fecha,
            temporadaId: nocheAnterior.temporadaId,
            tarifaId: nocheAnterior.tarifaId,
            precioNoche: Number(nocheAnterior.precioNoche),
            origen: nocheAnterior.origen,
          };
        }
        return {
          fecha: noche.fecha,
          temporadaId: noche.temporadaId,
          tarifaId: noche.tarifaId,
          precioNoche: noche.precioNoche,
          origen: "MOTOR",
        };
      });
      nochesPorHabitacion.set(habitacionPlan.habitacionId, noches);
    }

    const totalNuevo = [...nochesPorHabitacion.values()].reduce(
      (acc, noches) => acc + noches.reduce((a, n) => a + n.precioNoche, 0),
      0
    );

    if (soloPrevia) {
      return {
        totalAnterior,
        totalNuevo,
        diferencia: Number((totalNuevo - totalAnterior).toFixed(2)),
        mensajeNoReembolsable: huboReduccionNoReembolsable
          ? "Tarifa no reembolsable: la reducción de ocupación no modifica el precio."
          : null,
      };
    }

    const huespedGuardado = huesped ? await resolverHuesped(tx, huesped) : null;

    // Las habitaciones se reemplazan por completo (borrar + crear) en vez
    // de hacer un diff: la tabla puente no tiene datos propios que se
    // pierdan, y así la reserva queda exactamente con lo que mandó la
    // pantalla, sin estados intermedios raros. Las ReservaNoche viejas se
    // borran primero (FK contra reservas_habitaciones, sin cascada).
    const reservaHabitacionIdsViejos = actual.reservaHabitaciones.map((rh) => rh.id);
    if (reservaHabitacionIdsViejos.length > 0) {
      await tx.reservaNoche.deleteMany({ where: { reservaHabitacionId: { in: reservaHabitacionIdsViejos } } });
    }
    await tx.reservaHabitacion.deleteMany({ where: { reservaId } });
    const actualizada = await tx.reserva.update({
      where: { id: reservaId },
      data: {
        fechaDesde,
        fechaHasta,
        planTarifarioId: nuevoPlanTarifarioId,
        ...(huespedGuardado ? { huespedId: huespedGuardado.id } : {}),
        reservaHabitaciones: {
          create: habitaciones.map((h) => ({ habitacionId: h.habitacionId, adultos: h.adultos, menores: h.menores })),
        },
      },
      include: { reservaHabitaciones: true },
    });

    // Precio congelado por noche (HU-96), un loop aparte igual que en el
    // alta (crearReservaEnTransaccion): el doble de Prisma de los tests
    // solo sabe expandir un nivel de relación anidada.
    const reservaHabitacionIdPorHabitacion = new Map(actualizada.reservaHabitaciones.map((rh) => [rh.habitacionId, rh.id]));
    for (const [habitacionId, noches] of nochesPorHabitacion) {
      const reservaHabitacionId = reservaHabitacionIdPorHabitacion.get(habitacionId);
      for (const noche of noches) {
        await tx.reservaNoche.create({
          data: {
            reservaHabitacionId,
            fecha: parsearFechaSinHora(noche.fecha, "fecha"),
            temporadaId: noche.temporadaId,
            tarifaId: noche.tarifaId,
            planTarifarioId: nuevoPlanTarifarioId,
            precioNoche: noche.precioNoche,
            origen: noche.origen,
          },
        });
      }
    }

    return tx.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  };

  const resultado = await prisma.$transaction(ejecutar, { timeout: 15000, maxWait: 10000 });
  return soloPrevia ? resultado : formatearReserva(resultado);
}

// HU-37 — al cancelar, el período vuelve a estar disponible (lo hace solo:
// ESTADOS_QUE_OCUPAN deja afuera a "Cancelada", así que la próxima consulta
// de disponibilidad ya no la cuenta). El motivo es obligatorio.
//
// Política de cancelación (extensión de HU-37, atada a la seña de HU-88):
// con 24hs o más de anticipación respecto a la fecha de ingreso, la seña
// (el/los PagoEstadia activos de la reserva) se anula sola — reusa
// anularPago, nunca reimplementa la baja lógica. Con menos de 24hs, o si la
// fecha de ingreso ya pasó (no-show: nunca hubo check-in y la reserva sigue
// "Confirmada"), NO se anula nada: en los dos casos la anticipación real
// (fechaDesde - ahora) da menos de 24hs, así que un solo chequeo cubre
// ambos, sin necesidad de distinguirlos aparte.
//
// El require de pagoEstadiaServicio queda DIFERIDO a propósito (no al tope
// del archivo): pagoEstadia.servicio.js importa checkOut.servicio.js, que a
// su vez importa ESTE archivo — un require al tope formaría un ciclo, y
// checkOut.servicio.js capturaría un reservasServicio a medio cargar
// (module.exports todavía no asignado en ese punto). Adentro de la función
// no hay ciclo: para cuando esto corre, la carga inicial de módulos ya
// terminó.
async function cancelarReserva(id, data) {
  const reservaId = enteroPositivo(id, "id");
  const motivoCancelacion = textoObligatorio(
    data?.motivoCancelacion,
    "El motivo de cancelación",
    LIMITES_RESERVA.motivoCancelacion
  );

  const actual = await prisma.reserva.findUnique({ where: { id: reservaId } });
  if (!actual) throw new ErrorDeNegocio("La reserva no existe.", 404);
  if (actual.estado === ESTADO_RESERVA.CANCELADA) {
    throw new ErrorDeNegocio("La reserva ya está cancelada.");
  }
  if (actual.estado !== ESTADO_RESERVA.CONFIRMADA) {
    throw new ErrorDeNegocio(
      `No se puede cancelar una reserva en estado "${actual.estado}": con el huésped ya alojado corresponde el check-out.`
    );
  }

  const anticipacionMs = new Date(actual.fechaDesde).getTime() - Date.now();
  const anulaSenia = anticipacionMs >= MILISEGUNDOS_POR_DIA;

  const reserva = await prisma.$transaction(async (tx) => {
    const actualizada = await tx.reserva.update({
      where: { id: reservaId },
      data: { estado: ESTADO_RESERVA.CANCELADA, motivoCancelacion },
      include: INCLUDE_RESERVA,
    });

    if (anulaSenia) {
      const pagoEstadiaServicio = require("../pagos-estadia/pagoEstadia.servicio");
      const pagosActivos = await tx.pagoEstadia.findMany({ where: { reservaId, anulado: false } });
      for (const pago of pagosActivos) {
        await pagoEstadiaServicio.anularPago(pago.id, "Cancelación con anticipación (24hs+)", tx);
      }
    }

    return actualizada;
  });
  return formatearReserva(reserva);
}

// --------------------------------------------------------------
// Transiciones de estado para Check-in e Check-out
// --------------------------------------------------------------

// `cliente` es el `tx` de una transacción ya abierta por quien llama (o el
// prisma suelto si se usa aislado). Toda la validación de la transición
// vive acá, en un solo lugar, para que Check-in y Check-out no la
// reimplementen cada uno a su manera.
async function cambiarEstado(reservaId, estadoDestino, estadosOrigenValidos, cliente = prisma) {
  const id = enteroPositivo(reservaId, "reservaId");
  const reserva = await cliente.reserva.findUnique({ where: { id } });
  if (!reserva) throw new ErrorDeNegocio("La reserva no existe.", 404);
  if (!estadosOrigenValidos.includes(reserva.estado)) {
    throw new ErrorDeNegocio(
      `No se puede pasar la reserva de "${reserva.estado}" a "${estadoDestino}" ` +
        `(estados válidos de origen: ${estadosOrigenValidos.join(", ")}).`
    );
  }
  return cliente.reserva.update({ where: { id }, data: { estado: estadoDestino } });
}

// HU-47 (Integrante 3): confirmar el check-in. Se llama dentro de la misma
// transacción en la que se pone Habitacion.estado = "ocupada".
function marcarEnCurso(reservaId, cliente = prisma) {
  return cambiarEstado(reservaId, ESTADO_RESERVA.EN_CURSO, [ESTADO_RESERVA.CONFIRMADA], cliente);
}

// HU-48 a 52 (Integrante 4): confirmar el check-out.
//
// OJO — esta función SOLO mueve `Reserva.estado`. No toca `Habitacion` para
// nada. Igual que `marcarEnCurso` de arriba necesita que quien la llama
// también ponga `Habitacion.estado = "ocupada"` en la misma transacción
// (ver `ocuparHabitacion` en checkIn.servicio.js), quien llame a
// `marcarCerrada` tiene que actualizar `Habitacion.estado` a "en limpieza"
// para las habitaciones de la reserva, en la MISMA transacción — si no, el
// check-out cierra la reserva pero la habitación queda "ocupada" para
// siempre, sin ningún camino para liberarla (el "Cambiar estado" manual
// bloquea justamente esa transición a propósito, ver
// validarTransicionManual en habitaciones.servicio.js — no está pensado
// para reemplazar un check-out real, así que no sirve como parche).
// No usar `habitacionesServicio.cambiarEstadoHabitacion` para ese update:
// por la misma razón de arriba, esa función lo va a rechazar — hacer un
// `tx.habitacion.updateMany(...)` directo.
//
// Al momento de escribir esto ya existe una implementación real en la
// rama `feature/checkout-facturacion` (sin mergear) —
// `checkOut.servicio.js:confirmarCheckOut` — que hace exactamente esto.
// Si esa rama se mergea, esta nota queda como documentación de por qué
// está hecho así; si se reimplementa desde cero, hay que replicar el mismo
// patrón.
function marcarCerrada(reservaId, cliente = prisma) {
  return cambiarEstado(reservaId, ESTADO_RESERVA.CERRADA, [ESTADO_RESERVA.EN_CURSO], cliente);
}

module.exports = {
  // Alta y edición
  crearReserva,
  crearReservaConSena,
  crearReservaEnTransaccion,
  normalizarAltaReserva,
  modificarReserva,
  cancelarReserva,
  cotizarParaReserva,
  // Lectura
  listarReservas,
  obtenerReserva,
  obtenerPorCodigoConfirmacion,
  obtenerPorCodigoODocumento,
  consultarDisponibilidad,
  esLibreAhora,
  // Transiciones para Check-in / Check-out
  marcarEnCurso,
  marcarCerrada,
  // Utilidades expuestas para pruebas y para otros módulos
  formatearReserva,
  generarCodigoConfirmacion,
  enviarConfirmacionPorEmail,
  hoyComoFechaUTC,
  ErrorDeNegocio,
};
