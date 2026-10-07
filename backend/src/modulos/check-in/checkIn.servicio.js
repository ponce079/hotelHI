// Check-in (HU-43 a HU-47).
//
// No tiene tabla propia (ver Modelo_de_Datos_Sprint3_Holiday_Inn.docx): es
// lógica sobre `Reserva` (Integrante 2) y `Habitacion` (Integrante 1). El
// check-in en sí es la transición `Reserva.estado: 'Confirmada' → 'En curso'`
// + `Habitacion.estado: 'libre' → 'ocupada'`, siempre en una misma
// transacción (HU-47).
//
// Reuso de otros módulos, no reimplementación (ver Sprint3_..._CheckIn...md,
// sección 0): `reservasServicio.obtenerReserva/crearReservaEnTransaccion/
// marcarEnCurso` son los mismos que ya usan y prueban Reservas.
//
// `Habitacion.estado: 'libre' → 'ocupada'` (HU-47, en ocuparHabitaciones más
// abajo) se hace con un update directo, NO con
// `habitacionesServicio.cambiarEstadoHabitacion` — corrección posterior:
// esa función ahora valida una matriz de transiciones MANUALES (el
// "Cambiar estado" del staff) que bloquea a propósito cualquier salto a
// "ocupada" por esa vía, porque la única transición legítima es esta, la
// del check-in real. Mismo criterio que ya usan crearOrdenMantenimiento y
// checkOut.servicio.js para sus propias transiciones de negocio.

const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION, OPCIONES_TRANSACCION_LARGA } = require("../../lib/constantes");
const reservasServicio = require("../reservas/reservas.servicio");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const garantiaEstadiaServicio = require("../garantias/garantiaEstadia.servicio");
const { contactoDeHuesped } = require("../../lib/contacto");

// ErrorDeNegocio duplicada a propósito (mismo criterio documentado en
// movimientoSalida.servicio.js): esta carpeta queda autocontenida.
class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Misma zona de referencia que reservas.constantes.js / frontend/lib/fechas.js
// — duplicada acá porque es un literal, no lógica (mismo criterio que el
// resto del proyecto para constantes compartidas entre módulos).
const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

function hoyComoFechaISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
}

function hoyComoFechaUTC() {
  return new Date(`${hoyComoFechaISO()}T00:00:00.000Z`);
}

function formatearFechaCorta(fechaISO) {
  return new Date(fechaISO).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

// Error interno: el updateMany condicional de ocuparHabitaciones no alcanzó a todas las habitaciones. El motivo
// exacto (no existe / ya ocupada por otra estadía / en limpieza…) se lee DESPUÉS de revertir la transacción, con la
// instancia global y fuera de ella (adentro no se usa nunca la instancia global de prisma).
class HabitacionesNoLibres extends Error {
  constructor(habitacionIds) {
    super("Alguna de las habitaciones ya no está libre.");
    this.habitacionIds = habitacionIds;
  }
}

async function explicarHabitacionesNoLibres(habitacionIds) {
  const habitaciones = await prisma.habitacion.findMany({ where: { id: { in: habitacionIds } } });
  const porId = new Map(habitaciones.map((h) => [h.id, h]));
  for (const habitacionId of habitacionIds) {
    const habitacion = porId.get(habitacionId);
    if (!habitacion) return new ErrorDeNegocio("La habitación indicada no existe.", 404);
    if (habitacion.estado === "ocupada")
      return new ErrorDeNegocio(`La habitación ${habitacion.numero} ya está ocupada por otra estadía.`, 409);
    if (habitacion.estado !== "libre")
      return new ErrorDeNegocio(
        `La habitación ${habitacion.numero} no está libre (estado actual: "${habitacion.estado}") — no se puede completar el check-in.`,
        409
      );
  }
  // Las dos operaciones se cruzaron: cuando se la lee, ya volvió a estar libre. Mismo caso que un P2034.
  return new ErrorDeNegocio("Otra operación tomó la misma habitación al mismo tiempo. Actualizá la pantalla y volvé a intentar.", 409);
}

// Dos operaciones simultáneas sobre las mismas habitaciones (por ejemplo, un doble envío): si
// MySQL corta una por deadlock o conflicto de escritura (P2034), es el mismo caso que una
// habitación tomada por otra reserva: 409 con un mensaje para recepción. Lo mismo si la habitación ya
// no estaba libre al ocuparla (updateMany condicional) o si la misma persona ya figura alojada (índice único).
async function conConcurrenciaComo409(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.code === "P2034")
      throw new ErrorDeNegocio(
        "Otra operación tomó la misma habitación al mismo tiempo. Actualizá la pantalla y volvé a intentar.",
        409
      );
    if (err instanceof HabitacionesNoLibres) throw await explicarHabitacionesNoLibres(err.habitacionIds);
    throw err;
  }
}

function documentosCoinciden(a, b) {
  return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
}

function enteroPositivo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor a 0.`);
  return numero;
}

// reservasServicio.obtenerReserva/obtenerPorCodigoODocumento tiran SU
// propio ErrorDeNegocio (distinta clase), que checkIn.controlador.js no
// reconoce — sin esto, un código/documento inexistente cae en 500 genérico
// en vez del 404 que la búsqueda necesita para poder ofrecer un fallback
// (ver mismo patrón, mismo comentario, en checkOut.servicio.js).
function envolverErrorReservas(err) {
  if (err instanceof reservasServicio.ErrorDeNegocio) {
    return new ErrorDeNegocio(err.message, err.statusCode);
  }
  return err;
}

// --------------------------------------------------------------
// HU-43 — validación de vigencia (compartida entre "buscar" y "confirmar")
// --------------------------------------------------------------

// Lanza ErrorDeNegocio con el motivo puntual si la reserva no está en
// condiciones de iniciar el check-in. Separada de `buscarReservaParaCheckIn`
// para que el mismo chequeo se use también, sin duplicarlo, justo antes de
// escribir en `confirmarCheckInConReserva` — la pantalla puede haber quedado
// abierta un rato y la reserva pudo cambiar de estado mientras tanto.
function validarReservaVigente(reserva) {
  if (reserva.estado === ESTADO_RESERVA.CANCELADA) {
    throw new ErrorDeNegocio("La reserva está cancelada — no se puede hacer el check-in.");
  }
  if (reserva.estado === ESTADO_RESERVA.NO_SHOW) {
    throw new ErrorDeNegocio("La reserva fue marcada como no-show — no se puede hacer el check-in.");
  }
  if (reserva.estado === ESTADO_RESERVA.EN_CURSO) {
    throw new ErrorDeNegocio("Esta reserva ya tiene el check-in registrado.");
  }
  if (reserva.estado === ESTADO_RESERVA.CERRADA) {
    throw new ErrorDeNegocio("Esta reserva ya completó el check-out.");
  }
  if (reserva.estado !== ESTADO_RESERVA.CONFIRMADA) {
    throw new ErrorDeNegocio(`Estado de reserva inesperado: "${reserva.estado}".`);
  }
  // HU-43: "valida que la reserva ... esté vigente" — la tarea técnica lo
  // aclara como "fecha de ingreso": no se puede hacer check-in antes del
  // día de la reserva. No se bloquea después de fechaHasta a propósito: un
  // huésped que llega más tarde de lo previsto igual tiene que poder
  // registrar su ingreso (no es un caso que el criterio pida impedir).
  const hoy = hoyComoFechaUTC();
  const desde = new Date(reserva.fechaDesde);
  const desdeUTC = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  if (desdeUTC > hoy.getTime()) {
    throw new ErrorDeNegocio(
      `El check-in habilita a partir del ${formatearFechaCorta(reserva.fechaDesde)} (fecha de ingreso de la reserva).`
    );
  }
}

// HU-43 — búsqueda por id, por código de confirmación o por documento del
// huésped (un solo campo del lado del mostrador: `codigo` prueba primero
// como código exacto y si no matchea nada cae a documento — ver
// reservasServicio.obtenerPorCodigoODocumento), sin lanzar error de
// vigencia: la pantalla necesita poder MOSTRAR la reserva encontrada y el
// motivo por el que el check-in todavía no se puede confirmar (si aplica),
// no solo un 400 genérico.
async function buscarReservaParaCheckIn({ id, codigo } = {}) {
  let reserva;
  try {
    if (id) reserva = await reservasServicio.obtenerReserva(id);
    else if (codigo && String(codigo).trim()) reserva = await reservasServicio.obtenerPorCodigoODocumento(codigo);
    else throw new ErrorDeNegocio("Indicá el id o el código de confirmación / documento de la reserva.");
  } catch (err) {
    throw envolverErrorReservas(err);
  }

  let motivoBloqueo = null;
  try {
    validarReservaVigente(reserva);
  } catch (err) {
    motivoBloqueo = err.message;
  }
  return { reserva, puedeIniciarCheckIn: !motivoBloqueo, motivoBloqueo };
}

// --------------------------------------------------------------
// HU-46 — garantía del check-in. Ya NO se registra como un pago: es una
// PREAUTORIZACIÓN con tarjeta de crédito (se retiene el monto, no se cobra) o un
// DEPÓSITO en efectivo, en su propia tabla (garantias_estadia). Antes se
// guardaba como un PagoEstadia "Garantía" que consolidarCargos contaba como
// ya pagado: restaba del saldo en el check-out y nunca se liberaba ni se
// devolvía. Qué pasa con ella en el check-out (liberar, capturar para cubrir
// saldo, aplicar o devolver) lo resuelve el módulo de garantías.
// Detalle: garantias/garantiaEstadia.servicio.js.
// --------------------------------------------------------------

// --------------------------------------------------------------
// HU-47 — ocupar una habitación dentro de una transacción ya abierta
// --------------------------------------------------------------

// La reserva que llega acá pudo haberse hecho con `Habitacion.estado`
// ignorado a propósito (una entrada a futuro, HU-38 — ver reservas.servicio.js),
// pero el check-in ocupa la habitación DE INMEDIATO, hoy: si en el momento
// de confirmar la habitación ya no está "libre" (pasó a mantenimiento, quedó
// bloqueada, etc.), no tiene sentido pisarla a "ocupada" en silencio.
//
// Ocupa TODAS las habitaciones de la reserva con una lectura y una escritura
// (antes: ocuparHabitacion, un findUnique y un update por habitación), para que
// las consultas no crezcan con la cantidad de habitaciones.
async function ocuparHabitaciones(tx, habitacionIds) {
  const ids = [...new Set(habitacionIds)];
  // Una sola sentencia con la condición de estado: protege el estado físico de la habitación. No protege las
  // reservas futuras de esas fechas (eso lo hace el bloqueo + buscarConflictos de quien llama).
  const { count } = await tx.habitacion.updateMany({ where: { id: { in: ids }, estado: "libre" }, data: { estado: "ocupada" } });
  if (count !== ids.length) throw new HabitacionesNoLibres(ids);
}

// El módulo de garantías tiene su propia clase de error: sin traducirla, el
// controlador la trataría como un error inesperado (500) en vez de devolver el
// mensaje y el status reales (402 por tarjeta rechazada, 400 por datos inválidos).
async function iniciarGarantiaDeCheckIn(argumentos) {
  try {
    return await garantiaEstadiaServicio.iniciarGarantiaDeCheckIn(argumentos);
  } catch (err) {
    if (err instanceof garantiaEstadiaServicio.ErrorDeNegocio) throw new ErrorDeNegocio(err.message, err.statusCode);
    throw err;
  }
}

// --------------------------------------------------------------
// HU-43 + HU-46 + HU-47 — confirmar check-in de una reserva existente
// --------------------------------------------------------------

// ¿La reserva ya está "En curso" con las mismas habitaciones y las mismas personas que trae este pedido?
async function esCheckInYaConfirmado(reserva, habitaciones, personas) {
  if (reserva?.estado !== ESTADO_RESERVA.EN_CURSO || !Array.isArray(personas) || !Array.isArray(habitaciones)) return false;
  const actuales = new Set((reserva.habitaciones ?? []).map((h) => h.id));
  const pedidas = habitaciones.map((h) => Number(h?.habitacionId ?? h?.habitacionIdAnterior));
  if (pedidas.length !== actuales.size || pedidas.some((habitacionId) => !actuales.has(habitacionId))) return false;
  const { claveDeDocumento } = require("../estadia/cargaMasiva");
  const alojados = await prisma.ocupanteReserva.findMany({
    where: { reservaId: reserva.id, estado: "Alojado" },
    select: { nombre: true, apellido: true, tipoDocumento: true, paisDocumento: true, numeroDocumento: true, fechaNacimiento: true },
  });
  if (alojados.length !== personas.length) return false;
  const norm = (v) => String(v ?? "").trim().toUpperCase();
  const claveDe = (p) =>
    p.numeroDocumento
      ? claveDeDocumento(p)
      : `SIN|${norm(p.nombre)}|${norm(p.apellido)}|${p.fechaNacimiento instanceof Date ? p.fechaNacimiento.toISOString().slice(0, 10) : String(p.fechaNacimiento ?? "").slice(0, 10)}`;
  const registradas = new Set(alojados.map(claveDe));
  return personas.every((p) => registradas.has(claveDe(p)));
}

async function confirmarCheckInConReserva({
  confirmacionAmpliacion,
  operador,
  reservaId,
  numeroDocumentoIngresado,
  garantiaConfirmada,
  medioGarantia,
  garantiaTarjeta,
  claveIdempotencia,
  habitaciones,
  personas,
  totalEsperado,
  motivoTitularDistinto,
  corregirNombre,
}) {
  const id = enteroPositivo(reservaId, "reservaId");
  let reserva;
  try {
    reserva = await reservasServicio.obtenerReserva(id);
  } catch (err) {
    throw envolverErrorReservas(err);
  }
  // Rediseño del check-in: con `personas` en el body la identidad se toma de las personas que
  // ingresan (no hay un "documento presentado" aparte) y la confirmación es atómica con la
  // ocupación final (confirmacionAtomica.js). Sin `personas`, el flujo de siempre.
  const conOcupacion = Array.isArray(personas);

  // Reintento de un check-in que ya se confirmó (por ejemplo, el cliente venció la espera y volvió a enviar): si la
  // reserva ya está "En curso" con las mismas habitaciones y las mismas personas, se responde con el resultado
  // existente en vez de un 409 "ya tiene el check-in registrado" o "habitación ocupada".
  try {
    validarReservaVigente(reserva);
  } catch (err) {
    if (conOcupacion && (await esCheckInYaConfirmado(reserva, habitaciones, personas))) return reserva;
    throw err;
  }

  // HU-43 — "verificación del documento de identidad contra los datos de
  // Huesped": comparación real contra lo que ya quedó cargado en la
  // reserva, no una casilla decorativa que se puede tildar sin mirar.
  if (!conOcupacion && !documentosCoinciden(numeroDocumentoIngresado, reserva.huesped?.numeroDocumento)) {
    throw new ErrorDeNegocio(
      `El documento ingresado no coincide con el de la reserva (${reserva.huesped?.tipoDocumento} ${reserva.huesped?.numeroDocumento}).`
    );
  }

  // La tarjeta (guardada en la reserva, o una nueva) se preautoriza ANTES del
  // check-in: si se rechaza, no hay check-in. Si el check-in falla después, se
  // libera la retención. La pasarela nunca va dentro de la transacción.
  const pedirGarantia = () =>
    iniciarGarantiaDeCheckIn({
      pedido: { garantiaConfirmada, medioGarantia, garantiaTarjeta },
      reservaId: id,
      fechaHasta: new Date(reserva.fechaHasta),
      claveIdempotencia,
    });
  let garantia;
  let ejecutarConfirmacion = null;
  if (conOcupacion) {
    // La preautorización (pasarela) y las lecturas y validaciones de la confirmación no dependen entre sí: van en
    // paralelo. Si las validaciones fallan, se libera la retención recién tomada.
    const [resGarantia, resPreparacion] = await Promise.allSettled([
      pedirGarantia(),
      require("./confirmacionAtomica").prepararConfirmacion(reserva, {
        operador,
        habitaciones,
        personas,
        totalEsperado,
        motivoTitularDistinto,
        corregirNombre,
      }),
    ]);
    if (resPreparacion.status === "rejected") {
      if (resGarantia.status === "fulfilled") await resGarantia.value.liberar();
      throw resPreparacion.reason;
    }
    if (resGarantia.status === "rejected") throw resGarantia.reason;
    garantia = resGarantia.value;
    ejecutarConfirmacion = resPreparacion.value;
  } else {
    garantia = await pedirGarantia();
  }

  try {
    if (conOcupacion) {
      await ejecutarConfirmacion();
    } else {
      await conConcurrenciaComo409(() =>
        prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${id} FOR UPDATE`;
            const vigente = await tx.reserva.findUnique({ where: { id } });
            validarReservaVigente(vigente);
            await require("../estadia/ampliacion.servicio").ampliarSiCorresponde(tx, id, confirmacionAmpliacion);
            await require("../estadia/ingreso").prepararIngreso(tx, id, operador);
            await reservasServicio.marcarEnCurso(id, tx);
            await ocuparHabitaciones(
              tx,
              reserva.habitaciones.map((habitacion) => habitacion.id)
            );
          },
          OPCIONES_TRANSACCION
        )
      );
    }
  } catch (err) {
    await garantia.liberar();
    // Dos envíos del mismo check-in a la vez: el que perdió la carrera encuentra la reserva ya en curso. Si es el
    // mismo check-in, se responde con el resultado existente.
    if (conOcupacion && err instanceof require("./confirmacionAtomica").ReservaYaNoConfirmada) {
      const actual = await reservasServicio.obtenerReserva(id);
      if (await esCheckInYaConfirmado(actual, habitaciones, personas)) return actual;
      validarReservaVigente(actual);
      throw new ErrorDeNegocio("La reserva cambió de estado mientras se confirmaba. Actualizá la pantalla.", 409);
    }
    throw err;
  }

  // Registrar la garantía y releer la reserva para la respuesta no dependen entre sí: en paralelo.
  const [, resultado] = await Promise.all([garantia.registrar(id), reservasServicio.obtenerReserva(id)]);
  return resultado;
}

// --------------------------------------------------------------
// HU-44 + HU-45 — disponibilidad "ahora mismo" para walk-in / asignación
// manual de habitación (HU-45 solo tiene selección manual: sin sugerencia
// automática por tipo/disponibilidad/preferencias, ver decisiones.md).
// --------------------------------------------------------------

// Reusa la disponibilidad de Reservas (HU-38): consultarDisponibilidad ya
// exige por sí sola "libre AHORA" (`esLibreAhora`, ver reservas.servicio.js)
// cuando `fechaDesde` es hoy, que es siempre el caso acá — walk-in y
// asignación manual son "ahora", nunca a futuro. No hay filtro propio que
// reimplementar: si hubiera dos, correrían el riesgo de desincronizarse.
//
// Rediseño del check-in: `adultos`/`menores` viajan al motor para que cada plan traiga el
// total de ESA ocupación (y `planTarifarioId`), la capacidad mínima pasa a ser adultos +
// menores, y `excluir` (ids separados por coma) saca las habitaciones ya elegidas para otra
// habitación del mismo walk-in. Sin adultos se mantiene el comportamiento anterior (2/0).
async function listarHabitacionesLibresAhora({ fechaHasta, tipoHabitacionId, capacidadMinima, adultos, menores, excluir }) {
  const conOcupacion = adultos !== undefined && adultos !== "";
  const cantAdultos = conOcupacion ? Number(adultos) : undefined;
  const cantMenores = menores === undefined || menores === "" ? 0 : Number(menores);
  if (conOcupacion && (!Number.isInteger(cantAdultos) || cantAdultos < 1))
    throw new ErrorDeNegocio("Indicá al menos un adulto por habitación.");
  if (!Number.isInteger(cantMenores) || cantMenores < 0) throw new ErrorDeNegocio("La cantidad de menores no es válida.");
  const excluidas = new Set(
    (Array.isArray(excluir) ? excluir : String(excluir ?? "").split(","))
      .map((v) => Number(String(v).trim()))
      .filter((v) => Number.isInteger(v) && v > 0)
  );
  const minimaPedida = capacidadMinima ? Number(capacidadMinima) : 0;
  const minima = Math.max(minimaPedida || 0, conOcupacion ? cantAdultos + cantMenores : 0);
  const resultado = await reservasServicio.consultarDisponibilidad({
    fechaDesde: hoyComoFechaISO(),
    fechaHasta,
    tipoHabitacionId,
    capacidadMinima: minima || undefined,
    ...(conOcupacion ? { adultos: cantAdultos, menores: cantMenores } : {}),
  });
  return {
    ...resultado,
    habitaciones: resultado.habitaciones.filter((h) => h.estado === "libre" && !excluidas.has(h.id)),
  };
}

// --------------------------------------------------------------
// HU-44 — check-in walk-in: crea la reserva y confirma el check-in en un
// solo paso, reusando el alta de Reservas (HU-36) tal cual.
// --------------------------------------------------------------

// Etapa 4A (HU-95, ajuste A) — el plan tarifario es UNO por reserva (no por
// habitación, misma regla que el wizard de HU-36/40): `planTarifarioId` y
// `totalEsperado` viajan a nivel reserva, `habitaciones` trae solo la
// ocupación de cada una (adultos/menores).
async function registrarCheckInWalkIn({
  personas,
  operador,
  fechaHasta,
  habitaciones,
  planTarifarioId,
  totalEsperado,
  huesped,
  garantiaConfirmada,
  medioGarantia,
  garantiaTarjeta,
  claveIdempotencia,
  corregirNombre,
}) {
  // Rediseño del check-in — varias habitaciones (pueden ser de distinto tipo) con UN plan para
  // toda la reserva: si alguna habitación trae su propio plan, tiene que ser el mismo.
  const lista = Array.isArray(habitaciones) ? habitaciones : [];
  if (lista.some((h) => h?.planTarifarioId != null && h.planTarifarioId !== "" && Number(h.planTarifarioId) !== Number(planTarifarioId)))
    throw new ErrorDeNegocio("Todas las habitaciones de la reserva tienen que tener el mismo plan tarifario.");
  const repetidas = lista.map((h) => Number(h?.habitacionId)).filter((id, i, ids) => ids.indexOf(id) !== i);
  if (repetidas.length) throw new ErrorDeNegocio("La misma habitación figura dos veces. Elegí cada habitación una sola vez.");

  // Ocupación real de cada habitación contra las personas que ingresan (400 sin abrir la
  // transacción). El titular de la primera habitación es el titular de la reserva.
  const { validarOcupacionIngreso, resumirErrores } = require("./ocupacionIngreso");
  const fisicas = lista.length
    ? await prisma.habitacion.findMany({ where: { id: { in: lista.map((h) => Number(h.habitacionId)).filter(Number.isInteger) } } })
    : [];
  const validacion = validarOcupacionIngreso({
    habitaciones: lista.map((h) => {
      const fisica = fisicas.find((f) => f.id === Number(h.habitacionId));
      return {
        habitacionId: Number(h.habitacionId),
        numero: fisica?.numero ?? h.habitacionId,
        capacidad: fisica?.capacidad ?? 0,
        adultos: Number(h.adultos),
        menores: h.menores == null || h.menores === "" ? 0 : Number(h.menores),
      };
    }),
    personas,
    fechaIngreso: hoyComoFechaUTC(),
  });
  if (validacion.hayErrores) {
    const error = new ErrorDeNegocio(resumirErrores(validacion.errores));
    error.codigo = "OCUPACION_INVALIDA";
    error.detalle = validacion.errores;
    throw error;
  }

  // El huésped de la reserva se arma con el titular de la primera habitación (si la pantalla
  // no lo manda aparte). Se vincula por identidad de documento al crear la reserva: si ya
  // existe esa persona, se reutiliza y se actualiza (resolverHuesped).
  const titular = validacion.titularDeLaReserva;
  const huespedDeLaReserva =
    huesped ??
    (titular && {
      nombres: String(titular.nombre ?? "").trim(),
      apellido: String(titular.apellido ?? "").trim(),
      tipoDocumento: titular.tipoDocumento,
      numeroDocumento: titular.numeroDocumento,
      paisDocumento: titular.paisDocumento,
      fechaNacimiento: titular.fechaNacimiento,
      contacto: contactoDeHuesped({ email: titular.email, telefono: titular.telefono }),
    });

  // Mismo alta que HU-36 (recepcionista) — la "reserva inmediata" que pide
  // la tarea técnica de HU-44 no es un modelo aparte, es una Reserva común
  // que arranca hoy. `normalizarAltaReserva` valida el rango de fechas, el
  // huésped, el plan y las habitaciones (con ocupación) exactamente igual
  // que un alta asistida, y compara el precio contra `totalEsperado` con
  // el mismo motor (HU-96).
  const datos = reservasServicio.normalizarAltaReserva({
    fechaDesde: hoyComoFechaISO(),
    fechaHasta,
    habitaciones: lista.map(({ habitacionId, adultos, menores }) => ({ habitacionId, adultos, menores })),
    planTarifarioId,
    totalEsperado,
    huesped: huespedDeLaReserva,
    origen: "RECEPCION",
  });

  // Todo lo que no necesita bloqueo se resuelve FUERA de la transacción y EN PARALELO (con la base remota, el
  // tiempo es lo que cuesta cada ida y vuelta): reintento de un walk-in ya confirmado, disponibilidad previa,
  // cotización del motor, código de confirmación, y la validación de cada persona con las fichas que ya existen
  // por documento (ver ingresoRapido.js).
  const idsHabitaciones = datos.habitaciones.map((h) => h.habitacionId);
  if (fisicas.length !== idsHabitaciones.length) throw new ErrorDeNegocio("Alguna de las habitaciones elegidas no existe.", 404);
  const dadasDeBaja = fisicas.filter((h) => !h.activo);
  if (dadasDeBaja.length) throw new ErrorDeNegocio(`No se puede reservar una habitación dada de baja: ${dadasDeBaja.map((h) => h.numero).join(", ")}.`);

  const { prepararLote, resolverFichas, escribirOcupantes, esDuplicadoDeIdentidadActiva, MENSAJE_YA_ALOJADA } = require("./ingresoRapido");
  const { rechazarYaAlojadas } = require("../estadia/cargaMasiva");
  const personasServicio = require("../estadia/persona.servicio");
  const reservaEnMemoria = {
    id: null,
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
    huesped: huespedDeLaReserva,
    reservaHabitaciones: datos.habitaciones.map((h) => ({
      habitacionId: h.habitacionId,
      adultos: h.adultos,
      menores: h.menores,
      habitacion: fisicas.find((f) => f.id === h.habitacionId),
    })),
  };
  const [reintento, conflictosPrevios, cotizacion, codigoConfirmacion, resultadoLote] = await Promise.all([
    // Reintento de un walk-in que ya se confirmó (el cliente venció la espera y volvió a enviar): si hace menos de
    // 5 minutos se registró un ingreso del mismo titular, en la misma habitación y con las mismas fechas, se
    // responde con esa reserva. Se resuelve ANTES de preautorizar la garantía, así un reintento no deja otra retención.
    buscarWalkInReciente({ titular, datos }),
    reservasServicio.buscarConflictos(prisma, { habitacionIds: idsHabitaciones, fechaDesde: datos.fechaDesde, fechaHasta: datos.fechaHasta }),
    reservasServicio.cotizarReservaEnvuelto(
      {
        fechaDesde: datos.fechaDesde,
        fechaHasta: datos.fechaHasta,
        planTarifarioId: datos.planTarifarioId,
        habitaciones: datos.habitaciones,
        canal: "RECEPCION",
        fechaVenta: hoyComoFechaUTC(),
      },
      prisma
    ),
    reservasServicio.reservarCodigoLibre(prisma),
    // Si la persona ya figura alojada, prepararLote rechaza: pero cuando es el REINTENTO de un walk-in que ya se registró,
    // la respuesta correcta es la reserva existente, no ese rechazo. Por eso el error se guarda y se decide después.
    prepararLote(prisma, reservaEnMemoria, personas, { permisoNombre: { esAdmin: corregirNombre === true, usuario: operador } }).then(
      (valor) => ({ valor }),
      (error) => ({ error })
    ),
  ]);
  if (reintento) return reservasServicio.obtenerReserva(reintento.id);
  if (resultadoLote.error) throw resultadoLote.error;
  const lote = resultadoLote.valor;
  if (conflictosPrevios.length) throw reservasServicio.errorPorConflictos(conflictosPrevios);
  const plan = cotizacion.planes[0];
  if (!plan) throw new ErrorDeNegocio("El plan tarifario elegido no está disponible para este canal.");
  if (Math.round(plan.total * 100) !== Math.round(Number(datos.totalEsperado) * 100)) {
    const e = new ErrorDeNegocio(`El precio cambió desde la cotización: antes $${datos.totalEsperado}, ahora $${plan.total}. Volvé a cotizar.`, 409);
    e.codigo = "PRECIO_CAMBIO";
    e.detalle = {
      totalAnterior: Number(datos.totalEsperado),
      totalNuevo: plan.total,
      diferencia: Number((plan.total - Number(datos.totalEsperado)).toFixed(2)),
      mensajeNoReembolsable: null,
    };
    throw e;
  }
  // El nombre de una ficha existente está protegido (regla 2.3): prepararLote ya lo comprobó para todas las personas.
  const identidadTitular = personasServicio.claveDocumento({
    tipoDocumento: huespedDeLaReserva.tipoDocumento,
    paisDocumento: huespedDeLaReserva.paisDocumento,
    numeroDocumento: huespedDeLaReserva.numeroDocumento,
  });
  const fichaDelTitular = lote.fichas.find((f) => lote.identidades.get(f.id) === identidadTitular) ?? lote.fichas[0];

  // Walk-in: no hay reserva previa ni tarjeta guardada, así que la garantía es una
  // tarjeta de crédito nueva (se preautoriza) o un depósito en efectivo. Se
  // autoriza ANTES de crear nada: si la tarjeta se rechaza, no se crea la reserva.
  const garantia = await iniciarGarantiaDeCheckIn({
    pedido: { garantiaConfirmada, medioGarantia, garantiaTarjeta },
    fechaHasta: datos.fechaHasta,
    claveIdempotencia,
  });

  // DENTRO de la transacción: bloqueo y chequeo de conflictos por fechas (como en el alta: dos operaciones
  // simultáneas sobre la misma habitación y fechas, una gana y la otra recibe 409), ocupar las habitaciones con un
  // updateMany condicional y escrituras agrupadas. Si MySQL corta una por deadlock (P2034), se responde el mismo 409.
  const { Prisma } = require("@prisma/client");
  let reservaId;
  try {
    reservaId = await conConcurrenciaComo409(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM reservas_habitaciones WHERE habitacionId IN (${Prisma.join(idsHabitaciones)}) FOR UPDATE`
          );
          const conflictos = await reservasServicio.buscarConflictos(tx, {
            habitacionIds: idsHabitaciones,
            fechaDesde: datos.fechaDesde,
            fechaHasta: datos.fechaHasta,
          });
          if (conflictos.length) throw reservasServicio.errorPorConflictos(conflictos);
          await ocuparHabitaciones(tx, idsHabitaciones);

          const huespedes = await resolverFichas(tx, {
            reserva: reservaEnMemoria,
            reservaId: null,
            fichas: lote.fichas,
            identidades: lote.identidades,
            huespedesExistentes: lote.huespedesExistentes,
            extras: lote.extras,
            renombres: lote.renombres,
            menoresReutilizados: lote.menoresReutilizados,
            permisoNombre: { esAdmin: corregirNombre === true, usuario: operador },
          });
          const huespedId = huespedes.get(fichaDelTitular.id);

          const reserva = await tx.reserva.create({
            data: {
              huespedId,
              fechaDesde: datos.fechaDesde,
              fechaHasta: datos.fechaHasta,
              estado: ESTADO_RESERVA.EN_CURSO,
              codigoConfirmacion,
              planTarifarioId: datos.planTarifarioId,
              reservaHabitaciones: {
                create: datos.habitaciones.map((h) => ({ habitacionId: h.habitacionId, adultos: h.adultos, menores: h.menores })),
              },
            },
            include: { reservaHabitaciones: true },
          });
          const rhPorHabitacion = new Map(reserva.reservaHabitaciones.map((rh) => [rh.habitacionId, rh.id]));
          await tx.reservaNoche.createMany({
            data: plan.habitaciones.flatMap((habitacionPlan) =>
              habitacionPlan.detalle.map((noche) => ({
                reservaHabitacionId: rhPorHabitacion.get(habitacionPlan.habitacionId),
                fecha: new Date(`${String(noche.fecha).slice(0, 10)}T00:00:00.000Z`),
                temporadaId: noche.temporadaId,
                tarifaId: noche.tarifaId,
                planTarifarioId: datos.planTarifarioId,
                precioNoche: noche.precioNoche,
                origen: "MOTOR",
              }))
            ),
          });
          const notificacion = reservasServicio.armarNotificacionConfirmacion({
            reserva,
            huesped: personasServicio.datosDeHuesped(fichaDelTitular),
            habitaciones: fisicas,
            origen: "RECEPCION",
          });
          await tx.notificacion.createMany({ data: [notificacion] });

          await escribirOcupantes(tx, { reservaId: reserva.id, fichas: lote.fichas, huespedes, operador: String(operador ?? "").trim() || "Recepción" });
          return reserva.id;
        },
        OPCIONES_TRANSACCION_LARGA
      )
    );
  } catch (err) {
    await garantia.liberar();
    if (esDuplicadoDeIdentidadActiva(err)) {
      await rechazarYaAlojadas(prisma, lote.fichas);
      throw new ErrorDeNegocio(MENSAJE_YA_ALOJADA, 409);
    }
    throw err;
  }

  const [, resultado] = await Promise.all([garantia.registrar(reservaId), reservasServicio.obtenerReserva(reservaId)]);
  return resultado;
}

// Reintento de un walk-in: ¿ya hay una reserva "En curso" del mismo titular (identidad por documento), en la misma
// habitación y con las mismas fechas, con el ingreso registrado hace menos de 5 minutos? Sin tocar el esquema: el
// momento del ingreso es el del evento "Check-in: ocupantes registrados" de la propia reserva.
const VENTANA_REINTENTO_WALKIN_MS = 5 * 60 * 1000;
async function buscarWalkInReciente({ titular, datos }) {
  if (!titular?.numeroDocumento) return null;
  const personasServicio = require("../estadia/persona.servicio");
  const identidad = personasServicio.claveDocumento({
    tipoDocumento: titular.tipoDocumento,
    paisDocumento: titular.paisDocumento,
    numeroDocumento: titular.numeroDocumento,
  });
  if (!identidad) return null;
  const ficha = await prisma.huesped.findUnique({ where: { identidadDocumento: identidad }, select: { id: true } });
  if (!ficha) return null;
  const idsHabitaciones = datos.habitaciones.map((h) => h.habitacionId);
  const candidata = await prisma.reserva.findFirst({
    where: {
      estado: ESTADO_RESERVA.EN_CURSO,
      huespedId: ficha.id,
      fechaDesde: datos.fechaDesde,
      fechaHasta: datos.fechaHasta,
      reservaHabitaciones: { some: { habitacionId: { in: idsHabitaciones } } },
      historialEstadia: {
        some: { accion: "Check-in: ocupantes registrados", fecha: { gte: new Date(Date.now() - VENTANA_REINTENTO_WALKIN_MS) } },
      },
    },
    include: { reservaHabitaciones: { select: { habitacionId: true } } },
    orderBy: { id: "desc" },
  });
  if (!candidata) return null;
  const actuales = new Set(candidata.reservaHabitaciones.map((rh) => rh.habitacionId));
  const mismas = actuales.size === idsHabitaciones.length && idsHabitaciones.every((id) => actuales.has(id));
  return mismas ? candidata : null;
}

module.exports = {
  buscarReservaParaCheckIn,
  confirmarCheckInConReserva,
  listarHabitacionesLibresAhora,
  registrarCheckInWalkIn,
  validarReservaVigente,
  ocuparHabitaciones,
  conConcurrenciaComo409,
  HabitacionesNoLibres,
  esCheckInYaConfirmado,
  buscarWalkInReciente,
  ErrorDeNegocio,
};
