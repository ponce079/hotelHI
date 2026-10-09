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
const { enviarCorreo, conEsperaMaxima } = require("../../lib/correo");
const {
  ESTADO_RESERVA,
  ESTADOS_RESERVA,
  TIPOS_DOCUMENTO,
  CANALES_CONFIRMACION,
  DESTINATARIO_HUESPED,
  DESTINATARIO_RECEPCION,
  TIPO_NOTIFICACION_RESERVA,
  LIMITES_RESERVA,
  MAX_INTENTOS_CODIGO,
  LONGITUD_CODIGO_BYTES,
  ACCION_NOMBRE_WEB_DISTINTO,
} = require("./reservas.constantes");
// HU-89: hoyComoFechaUTC vive en lib/ (no acá) porque habitaciones.servicio.js
// también la necesita, y ese import directo desde acá cerraría un ciclo de
// require — ver el comentario en lib/tipoHabitacion.js.
const {
  hoyComoFechaUTC,
  parsearFechaSinHora: parsearFechaSinHoraBase,
  MAYORIA_EDAD,
} = require("../../lib/fechas");
const { conTipoPlano } = require("../../lib/tipoHabitacion");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
// Garantía con tarjeta (feature/garantia-tarjeta). Sin ciclo: ese módulo no
// importa reservas.servicio.js (solo reservas.constantes.js).
const garantiasServicio = require("../garantias/garantias.servicio");
const cierreReservaServicio = require("../garantias/cierreReserva.servicio");
// Etapa 4A (HU-95/96) — el motor de cotización es la ÚNICA fuente de
// cálculo de precio: acá nunca se calcula un importe a mano. Sin ciclo:
// cotizacion.servicio.js (y todo lo que importa, dentro de tarifas/) no
// depende de nada de reservas.
const cotizacionServicio = require("../tarifas/cotizacion.servicio");
// Etapa 4B (HU-97) — mismo redondeo a múltiplo de $100 que usa el motor de
// cotización, para que un ajuste manual termine en el mismo formato de
// precio que cualquier tarifa.
const { redondearAMultiploDe100 } = require("../tarifas/redondeo");
const {
  MODO_AJUSTE_PRECIO,
  MODOS_AJUSTE_PRECIO,
  MOTIVO_AJUSTE_MIN,
  MOTIVO_AJUSTE_MAX,
  HORA_CHECKIN,
  TIPO_PENALIDAD,
  TIPOS_PENALIDAD,
} = require("../tarifas/tarifas.constantes");
// Etapa 4B (HU-98) — cálculo de penalidades, en un servicio propio del
// módulo de tarifas (no reservas): reservas solo expone el endpoint de
// lectura, la lógica de negocio de la penalidad vive con las tarifas.
const penalidadesServicio = require("../tarifas/penalidades.servicio");
const { normalizarNumeroDocumento, claveNombre } = require("../../lib/documento");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
const { esEmail, esTelefono } = require("../../lib/contacto");
const { normalizarTipoDocumento } = require("../../lib/tiposDocumento");

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

// El titular de la reserva tiene que ser adulto en la fecha de ingreso.
function validarTitularAdulto(nacimiento, fechaIngreso) {
  const { edad } = require("../estadia/estadia.servicio");
  if (nacimiento > hoyComoFechaUTC() || edad(nacimiento, fechaIngreso) < MAYORIA_EDAD) {
    throw new ErrorDeNegocio("El titular debe tener al menos 18 años en la fecha de ingreso.");
  }
}

// HU-39: los campos obligatorios de la ficha del huésped se validan antes
// de confirmar la reserva, no después.
// Se guarda sin puntos, guiones ni espacios: "45.112.902" y "45112902" son el mismo documento.
function numeroDocumentoValido(valor) {
  const ingresado = textoObligatorio(valor, "El número de documento", LIMITES_RESERVA.numeroDocumento);
  const normalizado = normalizarNumeroDocumento(ingresado);
  if (!normalizado) throw new ErrorDeNegocio("El número de documento tiene que tener letras o números.");
  return normalizado;
}

function normalizarHuesped(data, fechaIngreso = hoyComoFechaUTC()) {
  if (!data || typeof data !== "object") {
    throw new ErrorDeNegocio("Faltan los datos del huésped.");
  }
  const tipoDocumento = normalizarTipoDocumento(data.tipoDocumento);
  if (data.fechaNacimiento) {
    const nacimiento = parsearFechaSinHora(data.fechaNacimiento, "La fecha de nacimiento del titular");
    validarTitularAdulto(nacimiento, fechaIngreso);
  }
  if (!tipoDocumento) {
    throw new ErrorDeNegocio(`El tipo de documento tiene que ser uno de: ${TIPOS_DOCUMENTO.join(", ")}.`);
  }
  // Huesped.contacto guarda el correo si lo hay y, si no, el teléfono (lib/contacto.js).
  const contactoIngresado = textoObligatorio(
    data.contacto,
    "El correo electrónico o teléfono del huésped",
    LIMITES_RESERVA.contacto
  );
  const contacto = esEmail(contactoIngresado) ? contactoIngresado.toLowerCase() : contactoIngresado;
  if (!esEmail(contacto) && !esTelefono(contacto)) {
    throw new ErrorDeNegocio(
      "El contacto del huésped tiene que ser un correo válido o un teléfono (números, +, espacios o guiones)."
    );
  }
  // Nombres y apellido por separado (mostrador y walk-in). Huesped.nombre sigue siendo el nombre
  // completo ("nombres apellido") para comprobantes y búsquedas. Un cliente que manda solo
  // `nombre` (por ejemplo, el e-commerce todavía) sigue funcionando como antes.
  const separados = data.nombres !== undefined || data.apellido !== undefined;
  const nombres = separados ? textoObligatorio(data.nombres, "Los nombres del huésped", LIMITES_RESERVA.nombres) : null;
  const apellido = separados ? textoObligatorio(data.apellido, "El apellido del huésped", LIMITES_RESERVA.apellido) : null;
  return {
    ...(separados
      ? { nombre: `${nombres} ${apellido}`, nombres, apellido }
      : { nombre: textoObligatorio(data.nombre, "El nombre del huésped", LIMITES_RESERVA.nombre) }),
    ...(data.fechaNacimiento
      ? { fechaNacimiento: parsearFechaSinHora(data.fechaNacimiento, "La fecha de nacimiento del titular") }
      : {}),
    tipoDocumento,
    ...(data.paisDocumento
      ? {
          paisDocumento: require("../estadia/persona.servicio").normalizarPais(
            textoObligatorio(data.paisDocumento, "El país emisor", 191)
          ),
        }
      : {}),
    numeroDocumento: numeroDocumentoValido(data.numeroDocumento),
    contacto,
    // Solo lo fija el controlador, y únicamente para un administrador con sesión.
    corregirNombre: data.corregirNombre === true,
    // Casilla "Actualizar la ficha del huésped con estos datos": sin ella, una ficha existente nunca se pisa en silencio.
    actualizarFicha: data.actualizarFicha === true,
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
          id: n.id,
          fecha: n.fecha,
          temporadaId: n.temporadaId,
          temporadaNombre: n.temporada?.nombre ?? null,
          temporadaNivel: n.temporada?.nivel ?? null,
          tarifaId: n.tarifaId,
          precioNoche: Number(n.precioNoche),
          origen: n.origen,
          // Etapa 4B (HU-97) — ajuste manual de precio, si lo hay.
          ajustada: n.ajustada,
          precioOriginal: n.precioOriginal != null ? Number(n.precioOriginal) : null,
          motivoAjuste: n.motivoAjuste ?? null,
          ajustadoPor: n.ajustadoPor ?? null,
          ajustadoEn: n.ajustadoEn ?? null,
        }));
      const subtotalAlojamiento = reservaNoches.reduce((acc, n) => acc + n.precioNoche, 0);
      return {
        id: h.id,
        numero: h.numero,
        ...conTipoPlano(h),
        capacidad: h.capacidad,
        piso: h.piso,
        estado: h.estado,
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
          // Por separado si el huésped los tiene (desde la quinta corrección); null en huéspedes viejos.
          nombres: reserva.huesped.nombres ?? null,
          apellido: reserva.huesped.apellido ?? null,
          fechaNacimiento: reserva.huesped.fechaNacimiento ?? null,
          paisDocumento: reserva.huesped.paisDocumento ?? null,
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
  // Etapa 4C — primero un findMany liviano (solo id, sin include): Prisma
  // igual ejecuta las consultas del `include` aunque el resultado base esté
  // vacío, así que el camino feliz (sin conflictos, la inmensa mayoría de
  // las altas) terminaba pagando 2 consultas de más, dos veces (acá y en el
  // chequeo protegido dentro de la transacción). El detalle completo
  // (habitación, código, fechas) para errorPorConflictos solo se pide si
  // de verdad hay algo que reportar.
  const coincidencias = await cliente.reservaHabitacion.findMany({
    where: {
      habitacionId: { in: habitacionIds },
      reserva: condicionSolapamiento(fechaDesde, fechaHasta, excluirReservaId),
    },
    select: { id: true },
  });
  if (coincidencias.length === 0) return [];
  return cliente.reservaHabitacion.findMany({
    where: { id: { in: coincidencias.map((c) => c.id) } },
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
  // planTarifarioId en cada plan (una sola consulta para todos los tipos).
  const planesConId = await conIdsDePlan([...cotizacionPorTipo.values()].flatMap((c) => c.planes));
  const idPlanPorCodigo = new Map(planesConId.map((p) => [p.codigo, p.planTarifarioId]));
  for (const cotizacion of cotizacionPorTipo.values()) {
    cotizacion.planes = cotizacion.planes.map((p) => ({ ...p, planTarifarioId: idPlanPorCodigo.get(p.codigo) ?? null }));
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
//
// El nombre de una ficha existente está protegido: si el documento ya está registrado con otro
// nombre, solo un administrador puede corregirlo (corregirNombre, que fija el controlador según
// la sesión). Cualquier otro rol —o la reserva web, sin sesión— recibe un 409 NOMBRE_DISTINTO.
function exigirMismoNombre(existente, datos, corregirNombre) {
  if (corregirNombre || claveNombre(existente.nombre) === claveNombre(datos.nombre)) return;
  const error = new ErrorDeNegocio(
    "Ese documento ya está registrado con otro nombre. Verificá el número o pedile a un administrador que corrija el nombre.",
    409
  );
  error.codigo = "NOMBRE_DISTINTO";
  throw error;
}

async function resolverHuesped(tx, datosConPermiso) {
  const { corregirNombre = false, actualizarFicha = false, ...datos } = datosConPermiso;
  const identidadDocumento = require("../estadia/persona.servicio").claveDocumento(datos);
  if (identidadDocumento) {
    // Persona que vuelve: se reutiliza su ficha y se actualiza. El correo manda: un correo ya
    // guardado no se reemplaza por un teléfono (por ejemplo, un walk-in que solo dejó teléfono).
    let existente = await tx.huesped.findUnique({ where: { identidadDocumento } });
    if (!existente) {
      try {
        return await tx.huesped.create({ data: { ...datos, identidadDocumento } });
      } catch (err) {
        if (err?.code !== "P2002") throw err;
        // Otra alta creó la MISMA ficha un instante antes (dos altas a la vez con un documento nuevo): el índice único
        // lo impidió. Se la relee con una lectura "actual" (FOR UPDATE; la lectura normal de esta transacción es de antes
        // del commit de la otra y no la vería) y se sigue como persona que vuelve: sin duplicar y sin pisar nada.
        const filas = await tx.$queryRaw`SELECT * FROM huespedes WHERE identidadDocumento = ${identidadDocumento} FOR UPDATE`;
        if (!filas.length) throw err;
        existente = filas[0];
      }
    }
    exigirMismoNombre(existente, datos, corregirNombre);
    const { nombre, nombres, apellido, ...resto } = datos;
    const nombreNuevo = corregirNombre ? { nombre, nombres: nombres ?? null, apellido: apellido ?? null } : {};
    if (!actualizarFicha) {
      // Persona que vuelve, sin pedir actualizar su ficha: nada de lo que ya tiene se pisa; solo se completa lo vacío
      // (el nombre solo lo corrige un administrador). Sin escrituras si no hay nada para completar.
      const vacio = (v) => v === null || v === undefined || String(v).trim() === "";
      const completar = {
        ...nombreNuevo,
        ...(vacio(existente.fechaNacimiento) && datos.fechaNacimiento ? { fechaNacimiento: datos.fechaNacimiento } : {}),
        ...(vacio(existente.contacto) && datos.contacto ? { contacto: datos.contacto } : {}),
        ...(vacio(existente.preferencias) && datos.preferencias ? { preferencias: datos.preferencias } : {}),
      };
      return Object.keys(completar).length ? tx.huesped.update({ where: { id: existente.id }, data: completar }) : existente;
    }
    const contacto = esEmail(datos.contacto) || !esEmail(existente.contacto) ? datos.contacto : existente.contacto;
    return tx.huesped.update({ where: { id: existente.id }, data: { ...resto, ...nombreNuevo, contacto } });
  }
  const existente = await tx.huesped.findFirst({
    where: { tipoDocumento: datos.tipoDocumento, numeroDocumento: datos.numeroDocumento, paisDocumento: null },
  });
  if (!existente) return tx.huesped.create({ data: datos });
  exigirMismoNombre(existente, datos, corregirNombre);

  // Solo se pisan los campos con valor nuevo: un alta que no repite el
  // contacto no tiene que borrar el que ya estaba cargado.
  const vacioLegacy = (v) => v === null || v === undefined || String(v).trim() === "";
  return tx.huesped.update({
    where: { id: existente.id },
    data: {
      ...(corregirNombre
        ? { nombre: datos.nombre, ...(datos.nombres ? { nombres: datos.nombres, apellido: datos.apellido } : {}) }
        : {}),
      // Igual que arriba: sin la casilla de actualizar la ficha, solo se completa lo vacío.
      ...(datos.fechaNacimiento && (actualizarFicha || vacioLegacy(existente.fechaNacimiento)) ? { fechaNacimiento: datos.fechaNacimiento } : {}),
      contacto: actualizarFicha ? datos.contacto ?? existente.contacto : vacioLegacy(existente.contacto) ? datos.contacto ?? existente.contacto : existente.contacto,
      preferencias: actualizarFicha ? datos.preferencias ?? existente.preferencias : vacioLegacy(existente.preferencias) ? datos.preferencias ?? existente.preferencias : existente.preferencias,
    },
  });
}

// HU-41. No hay proveedor de email/SMS configurado en el proyecto (misma
// "limitación conocida" que la validación de pago mockeada de HU-46), así
// que el envío se modela como el registro en Notificacion que pide el
// criterio de aceptación ("queda un registro del envío"), sin integración
// real. Sin datos de contacto cargados no se puede fingir un envío: queda
// como aviso interno para el mostrador.
// La confirmación va al contacto que se DECLARÓ al reservar (el mismo al que sale el correo), aunque la ficha existente
// conserve otro (por ejemplo un teléfono): sin la casilla "Actualizar la ficha" la ficha no se toca, pero la notificación
// y el envío usan lo declarado. Si no se declaró contacto, vale el de la ficha.
function conContactoDeclarado(huespedGuardado, declarado) {
  const contacto = typeof declarado?.contacto === "string" ? declarado.contacto.trim() : "";
  return contacto ? { ...huespedGuardado, contacto } : huespedGuardado;
}

function armarNotificacionConfirmacion({ reserva, huesped, habitaciones, origen }) {
  const numeros = habitaciones.map((h) => h.numero).join(", ");
  const periodo = `${formatearFechaMensaje(reserva.fechaDesde)} al ${formatearFechaMensaje(reserva.fechaHasta)}`;
  const base =
    `Reserva ${reserva.codigoConfirmacion} confirmada para ${huesped.nombre}: ` +
    `habitación/es ${numeros}, del ${periodo}` +
    (origen === "WEB" ? " (reserva web autogestionada)." : ".");

  // Con un teléfono como único contacto no hay correo que enviar: queda como aviso interno.
  if (!esEmail(huesped.contacto)) {
    return {
      tipo: TIPO_NOTIFICACION_RESERVA,
      reservaId: reserva.id,
      canal: "Interno",
      destinatarioArea: DESTINATARIO_RECEPCION,
      mensaje: `${base} Sin correo del huésped: avisar por teléfono (${huesped.contacto ?? "sin contacto"}).`,
    };
  }
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
  if (!esEmail(huesped?.contacto)) return { enviado: false, motivo: "El huésped no tiene correo cargado." };
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
  const nacimiento = parsearFechaSinHora(data?.huesped?.fechaNacimiento, "La fecha de nacimiento del titular");
  textoObligatorio(data?.huesped?.paisDocumento, "El país emisor del documento", 191);
  validarTitularAdulto(nacimiento, fechaDesde);
  return {
    fechaDesde,
    fechaHasta,
    // Etapa 4A (HU-95/96): ocupación por habitación + un plan tarifario
    // para toda la reserva + el total que el frontend mostró en la vista
    // previa (se recalcula y se compara adentro de la transacción).
    habitaciones: normalizarHabitacionesConOcupacion(data?.habitaciones),
    planTarifarioId: enteroPositivo(data?.planTarifarioId, "planTarifarioId"),
    totalEsperado: numeroNoNegativo(data?.totalEsperado, "totalEsperado"),
    huesped: normalizarHuesped(data?.huesped, fechaDesde),
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

  const cotizacion = await cotizarReservaEnvuelto(
    { fechaDesde, fechaHasta, planTarifarioId, habitaciones, canal, fechaVenta: hoyComoFechaUTC() },
    prisma
  );
  return { ...cotizacion, planes: await conIdsDePlan(cotizacion.planes) };
}

// El motor (cotizacion.servicio.js) identifica los planes por código; el alta necesita el id.
// Suma `planTarifarioId` a cada plan con UNA consulta, sin tocar el motor (cambio aditivo).
async function conIdsDePlan(planes, cliente = prisma) {
  const codigos = [...new Set((planes ?? []).map((p) => p.codigo))];
  if (codigos.length === 0) return planes ?? [];
  const filas = await cliente.planTarifario.findMany({
    where: { codigo: { in: codigos } },
    select: { id: true, codigo: true },
  });
  const idPorCodigo = new Map(filas.map((f) => [f.codigo, f.id]));
  return planes.map((p) => ({ ...p, planTarifarioId: idPorCodigo.get(p.codigo) ?? null }));
}

// Núcleo transaccional del alta. Público aparte de `crearReserva` para que
// Check-in (HU-44, walk-in) pueda crear la reserva DENTRO de su propia
// transacción, en vez de tener que reimplementar esta lógica.
async function crearReservaEnTransaccion(tx, datos, { incluirTitular = true } = {}) {
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
    const error = new ErrorDeNegocio(
      `El precio cambió desde la cotización: antes $${totalEsperado}, ahora $${plan.total}. Volvé a cotizar.`,
      409
    );
    // Rediseño del check-in (aditivo): mismo contrato que el 409 del confirmar con reserva.
    error.codigo = "PRECIO_CAMBIO";
    error.detalle = {
      totalAnterior: Number(totalEsperado),
      totalNuevo: plan.total,
      diferencia: Number((plan.total - Number(totalEsperado)).toFixed(2)),
      mensajeNoReembolsable: null,
    };
    throw error;
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
  // noche, con el detalle que ya calculó cotizarReserva arriba. Etapa 4C:
  // una sola `createMany` con TODAS las filas de TODAS las habitaciones
  // (antes: un `create` por noche, dentro de un loop anidado — contra
  // Clever Cloud, una reserva de varias noches/habitaciones podía superar
  // el timeout de la transacción solo por la cantidad de round-trips; ver
  // docs/bug-timeout-transacciones.md). Nested-create de 2 niveles tampoco
  // sirve acá: el doble de Prisma de los tests solo sabe expandir un nivel
  // de relación anidada.
  const reservaHabitacionIdPorHabitacion = new Map(reserva.reservaHabitaciones.map((rh) => [rh.habitacionId, rh.id]));
  const filasReservaNoche = plan.habitaciones.flatMap((habitacionPlan) =>
    habitacionPlan.detalle.map((noche) => ({
      reservaHabitacionId: reservaHabitacionIdPorHabitacion.get(habitacionPlan.habitacionId),
      fecha: parsearFechaSinHora(noche.fecha, "fecha"),
      temporadaId: noche.temporadaId,
      tarifaId: noche.tarifaId,
      planTarifarioId,
      precioNoche: noche.precioNoche,
      origen: "MOTOR",
    }))
  );
  await tx.reservaNoche.createMany({ data: filasReservaNoche });

  await tx.notificacion.create({
    data: armarNotificacionConfirmacion({
      reserva,
      huesped: conContactoDeclarado(huespedGuardado, huesped),
      habitaciones: habitacionesDb,
      origen,
    }),
  });

  if (incluirTitular) {
    const reservaConHabitaciones = {
      ...reserva,
      reservaHabitaciones: reserva.reservaHabitaciones.map((rh) => ({
        ...rh,
        habitacion: habitacionesDb.find((h) => h.id === rh.habitacionId),
      })),
    };
    await require("../estadia/titular.servicio").incorporarEnTransaccion(
      tx,
      reservaConHabitaciones,
      huespedGuardado,
      "Sistema: alta de reserva",
      true
    );
  }

  // Etapa 4C: la relectura con include (INCLUDE_RESERVA son ~9 consultas,
  // solo para armar la respuesta) se saca de la transacción — ver el
  // comentario junto a cada llamador. Acá adentro basta con el id.
  return reserva;
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
  let reintentadoPorChoque = false;
  for (let intento = 0; intento < MAX_INTENTOS_CODIGO; intento += 1) {
    try {
      const creada = await prisma.$transaction((tx) => crearReservaEnTransaccion(tx, datos), OPCIONES_TRANSACCION).catch(etiquetarTransaccionVencida);
      // Relectura con include fuera del commit (ver OPCIONES_TRANSACCION).
      const reserva = await prisma.reserva.findUnique({ where: { id: creada.id }, include: INCLUDE_RESERVA });
      const confirmacionEmail = await enviarConfirmacionPorEmail(reserva);
      return { ...formatearReserva(reserva), confirmacionEmail };
    } catch (err) {
      // Choque de escritura con otra alta (la base descartó esta transacción entera, sin guardar nada): se rehace UNA vez.
      if (err?.codigo === "OPERACION_CONCURRENTE" && !reintentadoPorChoque) {
        reintentadoPorChoque = true;
        continue;
      }
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

// Alta de reserva CON garantía (tarjeta de crédito o prepago). Reemplazó al alta
// con seña del 20 % (HU-88, retirada): la tarjeta respalda la reserva y los
// consumos, y en el caso normal hay un solo cobro, al final.
//
//   BAR (reembolsable):  se tokeniza la tarjeta, no se cobra nada.
//   NRF (no reembolsable): preautorizar → crear la reserva → capturar si salió
//     bien, liberar si falló. Si el pago se rechaza, la reserva no se crea.
//
// La llamada a la pasarela NUNCA va dentro de la transacción (es de red y el
// doc de timeouts lo prohíbe). La reserva y el registro de la garantía sí
// van en la misma transacción: si algo falla, no se crea ninguna de las dos.
// El precio no se calcula acá: lo valida crearReservaEnTransaccion contra la
// cotización (ReservaNoche).
async function crearReservaConGarantia(data) {
  const datos = normalizarAltaReserva(data);

  const plan = await prisma.planTarifario.findUnique({ where: { id: datos.planTarifarioId } });
  if (!plan) throw new ErrorDeNegocio("El plan tarifario elegido no existe.", 404);

  const validada = envolverErrorGarantias(() =>
    garantiasServicio.validarGarantiaDeReserva({
      garantia: data?.garantia,
      plan,
      totalEsperado: datos.totalEsperado,
      fechaHasta: datos.fechaHasta,
    })
  );

  // Chequeo rápido antes de cobrar nada ni abrir la transacción.
  const conflictosPrevios = await buscarConflictos(prisma, {
    habitacionIds: datos.habitaciones.map((h) => h.habitacionId),
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
  });
  if (conflictosPrevios.length > 0) throw errorPorConflictos(conflictosPrevios);

  // Un reintento del mismo pedido (doble clic, red caída) no vuelve a cobrar.
  const claveIdempotencia =
    typeof data?.claveIdempotencia === "string" && data.claveIdempotencia.trim()
      ? data.claveIdempotencia.trim()
      : crypto.randomUUID();

  const autorizada = await envolverErrorGarantiasAsync(() =>
    garantiasServicio.autorizarGarantia({ validada, totalEsperado: datos.totalEsperado, claveIdempotencia })
  );

  let creada;
  try {
    let ultimoError;
    let reintentadoPorChoque = false;
    for (let intento = 0; intento < MAX_INTENTOS_CODIGO && !creada; intento += 1) {
      try {
        creada = await prisma.$transaction(async (tx) => {
          const reservaCreada = await crearReservaEnTransaccion(tx, datos);
          await garantiasServicio.registrarEnTransaccion(tx, {
            reservaId: reservaCreada.id,
            autorizada,
            totalEsperado: datos.totalEsperado,
          });
          return reservaCreada;
        }, OPCIONES_TRANSACCION).catch(etiquetarTransaccionVencida);
      } catch (err) {
        // Choque de escritura con otra alta (la base descartó esta transacción entera, sin guardar nada): se rehace UNA vez.
        if (err?.codigo === "OPERACION_CONCURRENTE" && !reintentadoPorChoque) {
          reintentadoPorChoque = true;
          continue;
        }
        const esCodigoDuplicado =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          String(err.meta?.target ?? "").includes("codigoConfirmacion");
        if (!esCodigoDuplicado) throw err;
        ultimoError = err;
      }
    }
    if (!creada) {
      console.error("[reservas] Colisión repetida de codigoConfirmacion:", ultimoError);
      throw new ErrorDeNegocio("No se pudo generar un código de confirmación único, intentá de nuevo.", 503);
    }
  } catch (err) {
    // La reserva no se creó: se suelta la retención de la tarjeta.
    await garantiasServicio.liberarPreautorizacion(autorizada, claveIdempotencia);
    throw err;
  }

  // NRF con tarjeta: recién ahora se captura (y si falla, la reserva se cancela).
  await envolverErrorGarantiasAsync(() =>
    garantiasServicio.capturarCobroDeReserva({ reservaId: creada.id, autorizada, claveIdempotencia })
  );

  // Relectura con include fuera del commit (ver OPCIONES_TRANSACCION).
  const reservaCompleta = await prisma.reserva.findUnique({ where: { id: creada.id }, include: INCLUDE_RESERVA });
  // El email no está en el camino crítico del alta: se espera como máximo 1,5 s; si no llegó, sigue en segundo plano.
  // La confirmación va al contacto que se declaró al reservar, aunque la ficha existente conserve el suyo (no se la
  // actualiza sin la casilla "Actualizar la ficha del huésped con estos datos").
  const paraElEmail = { ...reservaCompleta, huesped: { ...reservaCompleta.huesped, contacto: datos.huesped?.contacto || reservaCompleta.huesped?.contacto } };
  const confirmacionEmail = await conEsperaMaxima(enviarConfirmacionPorEmail(paraElEmail), {
    etiqueta: `confirmación ${reservaCompleta.codigoConfirmacion}`,
  });
  const estadoFinal = autorizada.preautorizacion ? "Capturada" : autorizada.estado ?? "Capturada";
  return {
    ...formatearReserva(reservaCompleta),
    confirmacionEmail,
    garantia: garantiasServicio.resumenDeGarantia(autorizada, estadoFinal),
  };
}

// Igual que en el alta de siempre: solo una consulta sobre una transacción ya
// expirada garantiza que este intento no llegó al commit (otros P2028, por
// ejemplo durante el commit, NO se etiquetan como seguros para reintentar).
// El wizard reconoce `codigo` y ofrece actualizar la disponibilidad y reintentar.
function etiquetarTransaccionVencida(err) {
  // Dos altas a la vez que crean la misma ficha (o toman las mismas filas) pueden chocar en un deadlock de la base: la
  // base descarta UNA transacción entera (P2034) y no quedó nada guardado. Es un 409 para reintentar, no un error 500.
  if (err.code === "P2034") {
    const choque = new ErrorDeNegocio("Otra operación estaba registrando lo mismo al mismo tiempo. No se guardó nada: volvé a intentarlo.", 409);
    choque.codigo = "OPERACION_CONCURRENTE";
    throw choque;
  }
  if (err.code === "P2028" && err.meta?.operation === "query" && /expired transaction/i.test(err.message)) {
    const vencido = new ErrorDeNegocio(
      "Se terminó el tiempo de guardado (1 minuto). La reserva y la garantía no se guardaron " +
        "(si había una retención en la tarjeta, se liberó). Actualizá la disponibilidad para volver a intentarlo.",
      408
    );
    vencido.codigo = "RESERVA_TIEMPO_AGOTADO";
    throw vencido;
  }
  throw err;
}

// El módulo de garantías tiene su propia clase de error (mismo patrón que
// pagoEstadia): sin traducirla, el controlador la trataría como un error
// inesperado (500) en vez de devolver el mensaje y el status reales (402 por
// tarjeta rechazada, 400 por datos inválidos).
function traducirErrorGarantias(err) {
  if (err instanceof garantiasServicio.ErrorDeNegocio) return new ErrorDeNegocio(err.message, err.statusCode);
  // El cierre por cancelación/no-show tiene su propia clase (cierreReserva.servicio.js): sin traducirla, pedir la vista
  // previa de una reserva Cancelada, No-show, En curso o Cerrada daba 500 en vez del 400 real ("solo se calcula para
  // reservas confirmadas").
  if (err instanceof cierreReservaServicio.ErrorDeNegocio) return new ErrorDeNegocio(err.message, err.statusCode);
  return err;
}
function envolverErrorGarantias(fn) {
  try {
    return fn();
  } catch (err) {
    throw traducirErrorGarantias(err);
  }
}
async function envolverErrorGarantiasAsync(fn) {
  try {
    return await fn();
  } catch (err) {
    throw traducirErrorGarantias(err);
  }
}

// --------------------------------------------------------------
// Lectura (contrato con Integrantes 3 y 4)
// --------------------------------------------------------------

async function obtenerReserva(id) {
  const reservaId = enteroPositivo(id, "id");
  // En paralelo (sin sumar demora): la marca de la reserva web cuyo nombre declarado no coincide con la ficha (regla 2.6).
  const [reserva, nombresWebDistintos] = await Promise.all([
    prisma.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA }),
    prisma.eventoEstadia.count({ where: { reservaId, accion: ACCION_NOMBRE_WEB_DISTINTO } }),
  ]);
  if (!reserva) throw new ErrorDeNegocio("La reserva no existe.", 404);
  return { ...formatearReserva(reserva), nombreWebDistinto: nombresWebDistintos > 0 };
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
    where: { huesped: { numeroDocumento: { in: [...new Set([buscado, normalizarNumeroDocumento(buscado)])] } } },
    include: INCLUDE_RESERVA,
    orderBy: [{ fechaDesde: "desc" }, { id: "desc" }],
  });
  if (candidatas.length === 0) {
    throw new ErrorDeNegocio(`No existe una reserva con el código o documento "${buscado}".`, 404);
  }
  const vigente = candidatas.find((r) => r.estado === ESTADO_RESERVA.CONFIRMADA);
  return formatearReserva(vigente ?? candidatas[0]);
}

// Sin `pagina` ni `limite` devuelve el arreglo completo de siempre (lo usan Check-out, los tableros y otras pantallas).
// Con alguno de los dos devuelve una página: { reservas, total, pagina, limite, paginas, conteoPorEstado } (más nuevas
// primero), con los mismos filtros. `conteoPorEstado` cuenta TODAS las reservas (no solo las filtradas) con una sola
// consulta agrupada, para las tarjetas de resumen sin traer la lista entera.
const LIMITE_PAGINA_DEFECTO = 50;
const LIMITE_PAGINA_MAXIMO = 200;
async function listarReservas({ q, estado, desde, hasta, habitacionId, pagina, limite } = {}) {
  // `estado` admite uno o varios valores separados por coma ("Confirmada,En curso,Cerrada"). Un solo valor
  // se comporta como siempre; cada valor se valida contra los estados existentes.
  const estados = typeof estado === "string" ? estado.split(",").map((e) => e.trim()).filter(Boolean) : [];
  if (estados.some((e) => !ESTADOS_RESERVA.includes(e))) {
    throw new ErrorDeNegocio(`estado debe ser uno de: ${ESTADOS_RESERVA.join(", ")}.`);
  }
  const filtroEstado = estados.length === 0 ? {} : { estado: estados.length === 1 ? estados[0] : { in: [...new Set(estados)] } };
  const texto = typeof q === "string" ? q.trim() : "";
  // Filtro por período: trae las reservas que se pisan con el rango
  // pedido, no solo las que empiezan adentro — si no, una estadía larga
  // desaparece de la vista del día en que está en curso.
  const fechaDesdeFiltro = desde ? parsearFechaSinHora(desde, "El filtro de fecha desde") : null;
  const fechaHastaFiltro = hasta ? parsearFechaSinHora(hasta, "El filtro de fecha hasta") : null;

  const where = {
    ...filtroEstado,
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
            ...(normalizarNumeroDocumento(texto) && normalizarNumeroDocumento(texto) !== texto
              ? [{ huesped: { numeroDocumento: { contains: normalizarNumeroDocumento(texto) } } }]
              : []),
            { reservaHabitaciones: { some: { habitacion: { numero: { contains: texto } } } } },
          ],
        }
      : {}),
  };

  if (pagina === undefined && limite === undefined) {
    const reservas = await prisma.reserva.findMany({
      where,
      include: INCLUDE_RESERVA,
      orderBy: [{ fechaDesde: "desc" }, { id: "desc" }],
    });
    return reservas.map(formatearReserva);
  }

  const paginaActual = Math.max(1, Number.parseInt(pagina, 10) || 1);
  const tamano = Math.min(LIMITE_PAGINA_MAXIMO, Math.max(1, Number.parseInt(limite, 10) || LIMITE_PAGINA_DEFECTO));
  const [filas, total, porEstado] = await Promise.all([
    prisma.reserva.findMany({
      where,
      include: INCLUDE_RESERVA,
      // La más recién cargada primero (id autoincremental): el mismo orden que ya muestra la pantalla de Reservas.
      orderBy: [{ id: "desc" }],
      skip: (paginaActual - 1) * tamano,
      take: tamano,
    }),
    prisma.reserva.count({ where }),
    prisma.reserva.groupBy({ by: ["estado"], _count: { _all: true } }),
  ]);
  return {
    reservas: filas.map(formatearReserva),
    total,
    pagina: paginaActual,
    limite: tamano,
    paginas: Math.max(1, Math.ceil(total / tamano)),
    conteoPorEstado: Object.fromEntries(porEstado.map((g) => [g.estado, g._count._all])),
  };
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
async function modificarReserva(id, data, cliente = prisma) {
  const reservaId = enteroPositivo(id, "id");
  const actual = await cliente.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  if (!actual) throw new ErrorDeNegocio("La reserva no existe.", 404);
  exigirModificable(actual);

  const soloPrevia = data?.soloPrevia === true;
  const totalEsperado = data?.totalEsperado === undefined || data.totalEsperado === null ? null : Number(data.totalEsperado);
  if (totalEsperado !== null && !Number.isFinite(totalEsperado)) throw new ErrorDeNegocio("totalEsperado debe ser un número.");

  // Todo lo que depende de la reserva leída (plan, fechas, habitaciones y precios congelados). Se calcula una vez con la
  // lectura de afuera (validación rápida y vista previa) y, al confirmar, de nuevo con la reserva releída bajo bloqueo.
  const derivar = (actual) => {
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
    const huesped = data?.huesped === undefined ? null : normalizarHuesped(data.huesped, fechaDesde);

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

    return {
      actual,
      planActualEsNoReembolsable,
      nuevoPlanTarifarioId,
      cambiaPlan,
      fechaDesde,
      fechaHasta,
      habitaciones,
      habitacionIds,
      huesped,
      snapshotPorHabitacion,
      totalAnterior,
    };
  };
  const derivadoAfuera = derivar(actual);

  const ejecutar = async (tx) => {
    let derivado = derivadoAfuera;
    if (!soloPrevia) {
      // Orden de bloqueos: primero reservas, después reservas_habitaciones (más abajo), igual que el check-in.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM reservas WHERE id = ${reservaId} FOR UPDATE`);
      const releida = await tx.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
      if (!releida) throw new ErrorDeNegocio("La reserva no existe.", 404);
      exigirModificable(releida);
      derivado = derivar(releida);
    }
    const {
      actual,
      planActualEsNoReembolsable,
      nuevoPlanTarifarioId,
      cambiaPlan,
      fechaDesde,
      fechaHasta,
      habitaciones,
      habitacionIds,
      huesped,
      snapshotPorHabitacion,
      totalAnterior,
    } = derivado;
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
    let nochesQuePierdenAjuste = 0;
    // Etapa 4B (HU-97, decisión corregida por el usuario) — los datos de un
    // ajuste manual (ajustada/precioOriginal/motivoAjuste/ajustadoPor/
    // ajustadoEn) viajan siempre junto con el precio que queda: tanto si la
    // noche conserva su precio congelado sin cambios, como si queda
    // protegida por el Ajuste B de abajo (en los dos casos el precio que se
    // guarda es el que la noche ya tenía, ajustado o no). Solo se pierden
    // cuando la noche se recotiza de verdad con el motor y su precio cambia.
    function datosDeAjuste(nocheAnterior) {
      return {
        precioOriginal: nocheAnterior.precioOriginal,
        ajustada: nocheAnterior.ajustada,
        motivoAjuste: nocheAnterior.motivoAjuste,
        ajustadoPor: nocheAnterior.ajustadoPor,
        ajustadoEn: nocheAnterior.ajustadoEn,
      };
    }
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
            ...datosDeAjuste(nocheAnterior),
          };
        }
        // Ajuste B: ocupación distinta en un plan no reembolsable, y el
        // motor da un precio MENOR al que ya tenía esa noche → no se
        // aplica la baja, se conserva el precio anterior (y su ajuste, si
        // lo tenía: el precio que queda es exactamente ese).
        if (nocheAnterior && !mismaOcupacion && planActualEsNoReembolsable && noche.precioNoche < Number(nocheAnterior.precioNoche)) {
          huboReduccionNoReembolsable = true;
          return {
            fecha: noche.fecha,
            temporadaId: nocheAnterior.temporadaId,
            tarifaId: nocheAnterior.tarifaId,
            precioNoche: Number(nocheAnterior.precioNoche),
            origen: nocheAnterior.origen,
            ...datosDeAjuste(nocheAnterior),
          };
        }
        // Recotización real: el precio cambia, así que cualquier ajuste
        // manual que tuviera esta noche se pierde.
        if (nocheAnterior?.ajustada) nochesQuePierdenAjuste += 1;
        return {
          fecha: noche.fecha,
          temporadaId: noche.temporadaId,
          tarifaId: noche.tarifaId,
          precioNoche: noche.precioNoche,
          origen: "MOTOR",
          precioOriginal: null,
          ajustada: false,
          motivoAjuste: null,
          ajustadoPor: null,
          ajustadoEn: null,
        };
      });
      nochesPorHabitacion.set(habitacionPlan.habitacionId, noches);
    }

    const totalNuevo = [...nochesPorHabitacion.values()].reduce(
      (acc, noches) => acc + noches.reduce((a, n) => a + n.precioNoche, 0),
      0
    );

    // Regla provisoria hasta la HU-118 (cambio 1 a 1 con motivo "huésped / hotel"): en una tarifa no reembolsable
    // la modificación no puede bajar el total de la estadía. Permite cambiar a una habitación igual o mejor y agregar.
    if (planActualEsNoReembolsable && totalNuevo < totalAnterior - 0.01) {
      const monto = (n) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      throw new ErrorDeNegocio(
        `Con tarifa no reembolsable el total de la estadía no puede bajar (antes $${monto(totalAnterior)}, ahora $${monto(totalNuevo)}). Elegí una habitación de igual o mayor valor. Si el cambio lo causa el hotel, el gerente puede ajustar el precio.`
      );
    }

    if (soloPrevia) {
      // Rediseño del check-in (aditivo): detalle por habitación y por noche para la vista previa.
      const redondear = (n) => Number(n.toFixed(2));
      const porHabitacion = plan.habitaciones.map((habitacionPlan) => {
        const anterior = snapshotPorHabitacion.get(habitacionPlan.habitacionId);
        const totalAnteriorHabitacion = anterior
          ? [...anterior.noches.values()].reduce((a, n) => a + Number(n.precioNoche), 0)
          : 0;
        const totalNuevoHabitacion = (nochesPorHabitacion.get(habitacionPlan.habitacionId) ?? []).reduce(
          (a, n) => a + n.precioNoche,
          0
        );
        return {
          habitacionId: habitacionPlan.habitacionId,
          numero: habitacionPlan.numero,
          adultos: habitacionPlan.adultos,
          menores: habitacionPlan.menores,
          totalAnterior: redondear(totalAnteriorHabitacion),
          totalNuevo: redondear(totalNuevoHabitacion),
          diferencia: redondear(totalNuevoHabitacion - totalAnteriorHabitacion),
        };
      });
      const porFecha = new Map();
      const sumar = (fecha, campo, valor) => {
        if (!porFecha.has(fecha)) porFecha.set(fecha, { fecha, anterior: 0, nuevo: 0 });
        porFecha.get(fecha)[campo] += valor;
      };
      for (const { noches } of snapshotPorHabitacion.values())
        for (const [fecha, n] of noches) sumar(fecha, "anterior", Number(n.precioNoche));
      for (const noches of nochesPorHabitacion.values()) for (const n of noches) sumar(n.fecha, "nuevo", n.precioNoche);
      const diferenciaPorNoche = [...porFecha.values()]
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((n) => ({
          fecha: n.fecha,
          anterior: redondear(n.anterior),
          nuevo: redondear(n.nuevo),
          diferencia: redondear(n.nuevo - n.anterior),
        }));
      return {
        totalAnterior,
        totalNuevo,
        diferencia: Number((totalNuevo - totalAnterior).toFixed(2)),
        porHabitacion,
        diferenciaPorNoche,
        mensajeNoReembolsable: huboReduccionNoReembolsable
          ? "Tarifa no reembolsable: la reducción de ocupación no modifica el precio."
          : null,
        // Etapa 4B (HU-97) — avisa ANTES de confirmar si esta modificación va
        // a recotizar (y por lo tanto borrar) el ajuste manual de alguna
        // noche, para que el gerente/recepcionista no se lleve una sorpresa.
        mensajeAjustePerdido:
          nochesQuePierdenAjuste > 0
            ? `Se perderá el ajuste manual de ${nochesQuePierdenAjuste} noche${nochesQuePierdenAjuste === 1 ? "" : "s"}.`
            : null,
      };
    }

    // Control opcional del precio contra la vista previa que vio quien confirma (check-in y ampliación no lo mandan).
    if (totalEsperado !== null && Math.abs(totalNuevo - totalEsperado) > 0.01) {
      throw new ErrorDeNegocio("El precio cambió desde la vista previa. Revisá el nuevo total y confirmá de nuevo.", 409);
    }

    const huespedGuardado = huesped ? await resolverHuesped(tx, huesped) : null;

    // Conservamos los IDs de las habitaciones que siguen en la reserva.
    // Solo el módulo de reservas reemplaza sus noches y congela el precio.
    const reservaHabitacionIdsViejos = actual.reservaHabitaciones.map((rh) => rh.id);
    if (reservaHabitacionIdsViejos.length > 0) {
      await tx.reservaNoche.deleteMany({ where: { reservaHabitacionId: { in: reservaHabitacionIdsViejos } } });
    }
    await require("../estadia/reservaOcupantes").sincronizarOcupantes(
      tx,
      actual,
      { fechaDesde, fechaHasta, habitacionIds },
      ErrorDeNegocio
    );
    await tx.reservaHabitacion.deleteMany({ where: { reservaId, habitacionId: { notIn: habitacionIds } } });
    // Una sola updateMany por cada par (adultos, menores) distinto, en vez de un update por
    // habitación: las consultas dependen de la variedad de ocupaciones (acotada por la capacidad
    // de las habitaciones), no de cuántas habitaciones tenga la reserva.
    // Rediseño del check-in: UNA sola sentencia para todas las habitaciones que cambian de
    // ocupación (antes, un updateMany por cada par adultos/menores distinto).
    const cambiosOcupacion = habitaciones
      .map((h) => ({ h, anterior: actual.reservaHabitaciones.find((rh) => rh.habitacionId === h.habitacionId) }))
      .filter(({ h, anterior }) => anterior && (anterior.adultos !== h.adultos || anterior.menores !== h.menores));
    if (cambiosOcupacion.length > 0) {
      const casoAdultos = cambiosOcupacion.map(({ h, anterior }) => Prisma.sql`WHEN ${anterior.id} THEN ${h.adultos}`);
      const casoMenores = cambiosOcupacion.map(({ h, anterior }) => Prisma.sql`WHEN ${anterior.id} THEN ${h.menores}`);
      await tx.$executeRaw(
        Prisma.sql`UPDATE reservas_habitaciones SET adultos = CASE id ${Prisma.join(casoAdultos, " ")} END, menores = CASE id ${Prisma.join(casoMenores, " ")} END WHERE id IN (${Prisma.join(cambiosOcupacion.map(({ anterior }) => anterior.id))})`
      );
    }
    const actualizada = await tx.reserva.update({
      where: { id: reservaId },
      data: {
        fechaDesde,
        fechaHasta,
        planTarifarioId: nuevoPlanTarifarioId,
        ...(huespedGuardado ? { huespedId: huespedGuardado.id } : {}),
        reservaHabitaciones: {
          create: habitaciones
            .filter((h) => !actual.reservaHabitaciones.some((rh) => rh.habitacionId === h.habitacionId))
            .map((h) => ({ habitacionId: h.habitacionId, adultos: h.adultos, menores: h.menores })),
        },
      },
      include: { reservaHabitaciones: true },
    });

    // Precio congelado por noche (HU-96), una sola `createMany` igual que
    // en el alta (crearReservaEnTransaccion) — Etapa 4C, ver
    // docs/bug-timeout-transacciones.md. El doble de Prisma de los tests
    // solo sabe expandir un nivel de relación anidada, así que sigue
    // siendo un paso aparte, no un nested-create.
    const reservaHabitacionIdPorHabitacion = new Map(actualizada.reservaHabitaciones.map((rh) => [rh.habitacionId, rh.id]));
    const filasReservaNoche = [...nochesPorHabitacion.entries()].flatMap(([habitacionId, noches]) =>
      noches.map((noche) => ({
        reservaHabitacionId: reservaHabitacionIdPorHabitacion.get(habitacionId),
        fecha: parsearFechaSinHora(noche.fecha, "fecha"),
        temporadaId: noche.temporadaId,
        tarifaId: noche.tarifaId,
        planTarifarioId: nuevoPlanTarifarioId,
        precioNoche: noche.precioNoche,
        origen: noche.origen,
        // Etapa 4B (HU-97) — viaja junto con el precio (ver datosDeAjuste
        // más arriba): null/false cuando la noche se recotizó de verdad.
        precioOriginal: noche.precioOriginal,
        ajustada: noche.ajustada,
        motivoAjuste: noche.motivoAjuste,
        ajustadoPor: noche.ajustadoPor,
        ajustadoEn: noche.ajustadoEn,
      }))
    );
    if (filasReservaNoche.length > 0) {
      await tx.reservaNoche.createMany({ data: filasReservaNoche });
    }

    return tx.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  };

  let resultado;
  if (cliente === prisma) {
    try {
      resultado = await prisma.$transaction(ejecutar, OPCIONES_TRANSACCION);
    } catch (err) {
      // Deadlock o conflicto de escritura (P2034) con otra operación sobre la misma reserva: 409, como en el check-in.
      if (err?.code === "P2034") {
        throw new ErrorDeNegocio("Otra operación modificó la reserva al mismo tiempo. Actualizá la pantalla y volvé a intentar.", 409);
      }
      throw err;
    }
  } else {
    resultado = await ejecutar(cliente);
  }
  return soloPrevia ? resultado : formatearReserva(resultado);
}

const ESTADOS_QUE_ADMITEN_AJUSTE = [ESTADO_RESERVA.CONFIRMADA, ESTADO_RESERVA.EN_CURSO];

function exigirEstadoParaAjuste(reserva) {
  if (!ESTADOS_QUE_ADMITEN_AJUSTE.includes(reserva.estado)) {
    throw new ErrorDeNegocio(
      `Solo se puede ajustar el precio de una reserva "${ESTADO_RESERVA.CONFIRMADA}" o "${ESTADO_RESERVA.EN_CURSO}" (ésta está "${reserva.estado}").`
    );
  }
}

// Etapa 4B (HU-97) — el gerente pisa a mano el precio de una o más noches YA
// congeladas (cortesía o descuento negociado), con motivo obligatorio y
// trazabilidad. A diferencia de modificarReserva: no cambian habitación,
// fecha, ocupación ni plan, así que las filas de ReservaNoche se actualizan
// una por una (nunca delete+create), y NO aplica la restricción de "plan no
// reembolsable" de la regla 9 (modificarReserva) — es una decisión manual
// explícita del gerente, no una recotización contra el motor.
//
// `usuario` viene SIEMPRE de la sesión autenticada (req.usuarioActual.usuario
// en el controlador, nunca del body) — ver la ruta en reservas.routes.js.
async function ajustarPrecioReserva(id, data) {
  const reservaId = enteroPositivo(id, "id");
  const nocheIds = Array.isArray(data?.nocheIds) ? data.nocheIds.map((n) => enteroPositivo(n, "Cada noche elegida")) : [];
  if (nocheIds.length === 0) throw new ErrorDeNegocio("Elegí al menos una noche para ajustar.");

  const modo = data?.modo;
  if (!MODOS_AJUSTE_PRECIO.includes(modo)) {
    throw new ErrorDeNegocio(`modo debe ser uno de: ${MODOS_AJUSTE_PRECIO.join(", ")}.`);
  }
  const valor = Number(data?.valor);
  if (!Number.isFinite(valor)) throw new ErrorDeNegocio("valor debe ser un número.");
  if (modo === MODO_AJUSTE_PRECIO.PRECIO_FIJO && valor < 0) {
    throw new ErrorDeNegocio("El precio fijo debe ser mayor o igual a 0.");
  }
  if (modo === MODO_AJUSTE_PRECIO.DESCUENTO_PORCENTAJE && !(valor > 0 && valor <= 100)) {
    throw new ErrorDeNegocio("El porcentaje de descuento debe ser mayor a 0 y hasta 100.");
  }

  const motivo = textoObligatorio(data?.motivo, "El motivo del ajuste", MOTIVO_AJUSTE_MAX);
  if (motivo.length < MOTIVO_AJUSTE_MIN) {
    throw new ErrorDeNegocio(`El motivo del ajuste debe tener al menos ${MOTIVO_AJUSTE_MIN} caracteres.`);
  }

  const soloPrevia = data?.soloPrevia === true;
  // El usuario del body nunca se usa (ver comentario de arriba) salvo en
  // este único caso: cuando data.usuario ya viene resuelto por el
  // controlador desde req.usuarioActual, es la única fuente válida.
  const usuario = typeof data?.usuario === "string" && data.usuario.trim() ? data.usuario.trim() : "sistema";

  const actual = await prisma.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  if (!actual) throw new ErrorDeNegocio("La reserva no existe.", 404);
  exigirEstadoParaAjuste(actual);

  const todasLasNoches = actual.reservaHabitaciones.flatMap((rh) =>
    rh.reservaNoches.map((n) => ({ ...n, habitacionNumero: rh.habitacion?.numero ?? null }))
  );
  const nochePorId = new Map(todasLasNoches.map((n) => [n.id, n]));
  for (const nocheId of nocheIds) {
    if (!nochePorId.has(nocheId)) throw new ErrorDeNegocio(`La noche ${nocheId} no pertenece a esta reserva.`);
  }

  const totalAnterior = todasLasNoches.reduce((acc, n) => acc + Number(n.precioNoche), 0);

  const nochesAjustadas = nocheIds.map((nocheId) => {
    const noche = nochePorId.get(nocheId);
    const precioActual = Number(noche.precioNoche);
    const precioNuevo = Number(
      modo === MODO_AJUSTE_PRECIO.PRECIO_FIJO
        ? redondearAMultiploDe100(valor)
        : redondearAMultiploDe100(precioActual * (1 - valor / 100))
    );
    // Regla 1 — un segundo ajuste sobre la misma noche NO pisa
    // precioOriginal: conserva el precio de antes del PRIMER ajuste.
    const precioOriginal = noche.ajustada ? Number(noche.precioOriginal) : precioActual;
    return { id: noche.id, fecha: noche.fecha, habitacionNumero: noche.habitacionNumero, precioActual, precioNuevo, precioOriginal };
  });
  const nochesAjustadasPorId = new Map(nochesAjustadas.map((n) => [n.id, n]));
  const totalNuevo = todasLasNoches.reduce((acc, n) => {
    const ajuste = nochesAjustadasPorId.get(n.id);
    return acc + (ajuste ? ajuste.precioNuevo : Number(n.precioNoche));
  }, 0);

  if (soloPrevia) {
    return {
      totalAnterior,
      totalNuevo,
      diferencia: Number((totalNuevo - totalAnterior).toFixed(2)),
      noches: nochesAjustadas.map(({ id: nid, fecha, habitacionNumero, precioActual, precioNuevo }) => ({
        id: nid,
        fecha,
        habitacionNumero,
        precioActual,
        precioNuevo,
      })),
    };
  }

  const ejecutar = async (tx) => {
    // Lock de una sola fila (mismo patrón que checkOut.servicio.js): acá no
    // se tocan habitaciones/fechas, así que no hace falta el lock de
    // reservas_habitaciones que sí usa modificarReserva.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM reservas WHERE id = ${reservaId} FOR UPDATE`);
    const reservaActual = await tx.reserva.findUnique({ where: { id: reservaId }, select: { estado: true } });
    if (!reservaActual) throw new ErrorDeNegocio("La reserva no existe.", 404);
    exigirEstadoParaAjuste(reservaActual);

    const ahora = new Date();
    for (const ajuste of nochesAjustadas) {
      await tx.reservaNoche.update({
        where: { id: ajuste.id },
        data: {
          precioNoche: ajuste.precioNuevo,
          precioOriginal: ajuste.precioOriginal,
          ajustada: true,
          motivoAjuste: motivo,
          ajustadoPor: usuario,
          ajustadoEn: ahora,
        },
      });
    }
    return tx.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  };

  const resultado = await prisma.$transaction(ejecutar, OPCIONES_TRANSACCION);
  return formatearReserva(resultado);
}

// Etapa 4B (HU-98) — delgado a propósito: la lógica de negocio vive en
// tarifas/penalidades.servicio.js (el enunciado pide que viva ahí), reservas
// solo la expone bajo /api/reservas/:id/penalidad. Mismo envoltorio fino que
// cotizarReservaEnvuelto: penalidades.servicio.js tiene su propia clase
// ErrorDeNegocio, sin traducirla acá el controlador la trataría como un
// error inesperado (500) en vez del 400/404 real.
async function obtenerPenalidad(id, tipo) {
  const reservaId = enteroPositivo(id, "id");
  try {
    return await penalidadesServicio.calcularPenalidad({ reservaId, tipo, momento: new Date() });
  } catch (err) {
    if (err instanceof penalidadesServicio.ErrorDeNegocio) {
      throw new ErrorDeNegocio(err.message, err.statusCode);
    }
    throw err;
  }
}

// HU-37 + garantía con tarjeta. Reemplaza la regla fija de 24 hs (que
// anulaba la seña entera o la dejaba entera): ahora la penalidad la calcula
// tarifas (calcularPenalidad: sin cargo dentro del plazo del plan, primera
// noche fuera de plazo, total en tarifa no reembolsable) y el módulo de
// garantías la cobra. Ver garantias/cierreReserva.servicio.js.
//
// Devuelve la reserva cancelada MÁS `penalidad`: cuánto se retuvo, devolvió y
// cobró, y si algo quedó pendiente de cobro (la reserva se cancela igual: el
// huésped tiene derecho a cancelar aunque la tarjeta rechace).
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
  if (actual.estado === ESTADO_RESERVA.NO_SHOW) {
    throw new ErrorDeNegocio("La reserva ya fue marcada como no-show.");
  }
  if (actual.estado !== ESTADO_RESERVA.CONFIRMADA) {
    throw new ErrorDeNegocio(
      `No se puede cancelar una reserva en estado "${actual.estado}": con el huésped ya alojado corresponde el check-out.`
    );
  }

  const penalidad = await envolverErrorGarantiasAsync(() =>
    cierreReservaServicio.cerrarReservaConPenalidad({
      reservaId,
      tipo: "CANCELACION",
      estadoDestino: ESTADO_RESERVA.CANCELADA,
      motivo: motivoCancelacion,
    })
  );
  const reserva = await prisma.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  return { ...formatearReserva(reserva), penalidad };
}

// Vista previa de lo que pasaría al cancelar o marcar no-show: la misma
// liquidación que hace el cierre real (retenido / devuelto / a cobrar), sin
// escribir nada. La pantalla la muestra ANTES de confirmar.
async function previsualizarCierreReserva(id, tipo) {
  const reservaId = enteroPositivo(id, "id");
  if (tipo !== "CANCELACION" && tipo !== "NO_SHOW") {
    throw new ErrorDeNegocio('tipo debe ser "CANCELACION" o "NO_SHOW".');
  }
  return envolverErrorGarantiasAsync(() => cierreReservaServicio.previsualizarCierre({ reservaId, tipo }));
}

// Llegadas no presentadas: reservas Confirmadas cuya fecha de llegada ya pasó.
// "Pasó" = anterior a hoy (hora argentina); el mismo día todavía puede llegar.
async function listarNoShowPendientes() {
  const reservas = await prisma.reserva.findMany({
    where: { estado: ESTADO_RESERVA.CONFIRMADA, fechaDesde: { lt: hoyComoFechaUTC() } },
    include: INCLUDE_RESERVA,
    orderBy: [{ fechaDesde: "asc" }, { id: "asc" }],
  });
  return reservas.map(formatearReserva);
}

// Marca el no-show: cobra la penalidad que corresponde al plan (calcularPenalidad
// con tipo NO_SHOW), pasa la reserva a "No-show" y libera las habitaciones
// (ESTADOS_QUE_OCUPAN no incluye No-show).
async function marcarNoShow(id, data) {
  const reservaId = enteroPositivo(id, "id");
  const actual = await prisma.reserva.findUnique({ where: { id: reservaId } });
  if (!actual) throw new ErrorDeNegocio("La reserva no existe.", 404);
  if (actual.estado === ESTADO_RESERVA.NO_SHOW) throw new ErrorDeNegocio("La reserva ya fue marcada como no-show.");
  if (actual.estado !== ESTADO_RESERVA.CONFIRMADA) {
    throw new ErrorDeNegocio(`Solo se puede marcar no-show una reserva "${ESTADO_RESERVA.CONFIRMADA}" (ésta está "${actual.estado}").`);
  }
  if (new Date(actual.fechaDesde) >= hoyComoFechaUTC()) {
    throw new ErrorDeNegocio("Todavía no corresponde marcar no-show: la fecha de llegada no pasó.");
  }
  const observacion =
    typeof data?.motivo === "string" && data.motivo.trim()
      ? textoObligatorio(data.motivo, "El motivo", LIMITES_RESERVA.motivoCancelacion)
      : null;
  const motivo = observacion ? `No-show: ${observacion}` : "No-show: el huésped no se presentó.";

  const penalidad = await envolverErrorGarantiasAsync(() =>
    cierreReservaServicio.cerrarReservaConPenalidad({
      reservaId,
      tipo: "NO_SHOW",
      estadoDestino: ESTADO_RESERVA.NO_SHOW,
      motivo: motivo.slice(0, LIMITES_RESERVA.motivoCancelacion),
    })
  );
  const reserva = await prisma.reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESERVA });
  return { ...formatearReserva(reserva), penalidad };
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
  crearReservaConGarantia,
  previsualizarCierreReserva,
  listarNoShowPendientes,
  marcarNoShow,
  crearReservaEnTransaccion,
  resolverHuesped,
  normalizarAltaReserva,
  modificarReserva,
  ajustarPrecioReserva,
  cancelarReserva,
  cotizarParaReserva,
  obtenerPenalidad,
  // Lectura
  listarReservas,
  obtenerReserva,
  obtenerPorCodigoConfirmacion,
  obtenerPorCodigoODocumento,
  consultarDisponibilidad,
  esLibreAhora,
  buscarConflictos,
  conIdsDePlan,
  // Piezas del alta que el walk-in reutiliza para armar su transacción corta (check-in/ingresoRapido.js)
  errorPorConflictos,
  cotizarReservaEnvuelto,
  reservarCodigoLibre,
  armarNotificacionConfirmacion,
  conContactoDeclarado,
  exigirMismoNombre,
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
