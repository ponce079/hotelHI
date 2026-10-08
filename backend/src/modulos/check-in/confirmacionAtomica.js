// Rediseño del check-in — confirmación atómica de una reserva con la ocupación REAL.
//
// POST /api/check-in/:id/confirmar con `personas` en el body entra por acá (desde
// confirmarCheckInConReserva, checkIn.servicio.js). En UNA transacción, con cantidad fija de
// consultas (salvo el motor de tarifas, ver más abajo):
//   1. bloquea la reserva y revalida su vigencia;
//   2. valida los cambios de habitación (mismo tipo, libre, sin reserva encimada, no repetida);
//   3. recalcula el total con la ocupación final (lógica de modificarReserva) y lo compara con
//      `totalEsperado`: si difiere → 409 PRECIO_CAMBIO antes de escribir nada;
//   4. aplica la modificación de ocupación (recotización noche por noche, regla NRF incluida);
//   5. reasigna la habitación (ReservaHabitacion.habitacionId; las noches cuelgan de esa fila,
//      así que el precio no cambia);
//   6. da de baja lógica las fichas Previstas anteriores ("Reemplazada en el check-in");
//   7. carga a todas las personas en lote (fichas verificadas) y audita un titular distinto;
//   8. prepara el ingreso, pasa la reserva a "En curso" y ocupa las habitaciones definitivas.
// La garantía NO se toca acá: confirmarCheckInConReserva la valida antes y la registra después,
// exactamente como siempre.
//
// Excepción documentada (cantidad de consultas): cuando cambia la ocupación, el motor de tarifas
// (cotizacion.servicio.js: cotizarReserva) hace una consulta por habitación. No se modifica en
// esta rama; el tope es LIMITES_RESERVA.habitacionesPorReserva (20).
const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION_LARGA } = require("../../lib/constantes");
const { prepararLote, escribirLote, esDuplicadoDeIdentidadActiva, MENSAJE_YA_ALOJADA } = require("./ingresoRapido");
const reservasServicio = require("../reservas/reservas.servicio");
const estadia = require("../estadia/estadia.servicio");
const { rechazarYaAlojadas } = require("../estadia/cargaMasiva");
const { validarOcupacionIngreso, resumirErrores } = require("./ocupacionIngreso");

const MOTIVO_REEMPLAZO = "Reemplazada en el check-in";
const centavos = (n) => Math.round(Number(n) * 100);

function error(mensaje, statusCode, codigo, detalle) {
  const { ErrorDeNegocio } = require("./checkIn.servicio");
  const e = new ErrorDeNegocio(mensaje, statusCode);
  if (codigo) e.codigo = codigo;
  if (detalle) e.detalle = detalle;
  return e;
}

const entero = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

// Habitaciones del body contra las de la reserva: cada una exactamente una vez.
function normalizarHabitaciones(reserva, habitaciones) {
  if (!Array.isArray(habitaciones) || habitaciones.length === 0)
    throw error("Indicá la ocupación de cada habitación de la reserva.", 400, "OCUPACION_INVALIDA");
  const deLaReserva = new Map(reserva.habitaciones.map((h) => [h.id, h]));
  const vistas = new Set();
  const resultado = habitaciones.map((h) => {
    const anteriorId = entero(h?.habitacionIdAnterior ?? h?.habitacionId);
    const anterior = deLaReserva.get(anteriorId);
    if (!anterior) throw error("Una de las habitaciones indicadas no pertenece a esta reserva.", 400, "OCUPACION_INVALIDA");
    if (vistas.has(anteriorId))
      throw error(`La habitación ${anterior.numero} figura dos veces. Indicá cada habitación una sola vez.`, 400, "OCUPACION_INVALIDA");
    vistas.add(anteriorId);
    const habitacionId = h?.habitacionId == null || h?.habitacionId === "" ? anteriorId : entero(h.habitacionId);
    if (!Number.isInteger(habitacionId) || habitacionId < 1)
      throw error(`La habitación elegida para reemplazar a la ${anterior.numero} no es válida.`, 400, "OCUPACION_INVALIDA");
    return { anterior, habitacionId, adultos: entero(h.adultos), menores: h.menores == null ? 0 : entero(h.menores) };
  });
  const faltantes = reserva.habitaciones.filter((h) => !vistas.has(h.id));
  if (faltantes.length)
    throw error(
      `Falta indicar la ocupación de la habitación ${faltantes.map((h) => h.numero).join(", ")}.`,
      400,
      "OCUPACION_INVALIDA",
    );
  const definitivas = resultado.map((h) => h.habitacionId);
  const repetida = resultado.find((h, i) => definitivas.indexOf(h.habitacionId) !== i);
  if (repetida)
    throw error("La misma habitación quedó elegida para dos habitaciones de la reserva.", 409, "CAMBIO_HABITACION_INVALIDO", {
      habitacionIdAnterior: repetida.anterior.id,
    });
  return resultado;
}

// detalle.habitacionIdAnterior (aditivo, etapa 2): qué tarjeta de habitación marca la pantalla.
// Reglas del cambio de habitación al ingresar: mismo tipo, activa, libre, no incluida ya en la
// reserva y sin otra reserva encimada en ninguna noche de la estadía.
// Parte sin bloqueo (fuera de la transacción): existencia, tipo y estado de las habitaciones nuevas.
function validarDatosDeLasHabitacionesNuevas(reserva, cambios, nuevas) {
  const idsReserva = new Set(reserva.habitaciones.map((h) => h.id));
  const porId = new Map(nuevas.map((h) => [h.id, h]));
  for (const { anterior, habitacionId } of cambios) {
    const nueva = porId.get(habitacionId);
    const quien = `la habitación ${anterior.numero}`;
    if (!nueva || !nueva.activo)
      throw error(`La habitación elegida para reemplazar a ${quien} no existe o está dada de baja.`, 409, "CAMBIO_HABITACION_INVALIDO", {
        habitacionIdAnterior: anterior.id,
      });
    if (idsReserva.has(habitacionId))
      throw error(`La habitación ${nueva.numero} ya forma parte de esta reserva.`, 409, "CAMBIO_HABITACION_INVALIDO", {
        habitacionIdAnterior: anterior.id,
      });
    if (nueva.tipoHabitacionId !== anterior.tipoHabitacionId)
      throw error(
        `La habitación ${nueva.numero} es de otro tipo: solo se puede cambiar ${quien} por una del mismo tipo (${anterior.tipo}).`,
        409,
        "CAMBIO_HABITACION_INVALIDO",
        { habitacionIdAnterior: anterior.id },
      );
    if (!reservasServicio.esLibreAhora(nueva))
      throw error(
        `La habitación ${nueva.numero} no está libre (estado actual: ${nueva.estado}).`,
        409,
        "CAMBIO_HABITACION_INVALIDO",
        { habitacionIdAnterior: anterior.id },
      );
  }
}

// Parte con bloqueo (DENTRO de la transacción): ninguna otra reserva encimada en las noches de la estadía. El
// updateMany condicional de la habitación protege su estado físico; esto protege las reservas de esas fechas.
async function validarConflictosDeCambios(cliente, reserva, cambios) {
  const conflictos = await reservasServicio.buscarConflictos(cliente, {
    habitacionIds: cambios.map((c) => c.habitacionId),
    fechaDesde: new Date(reserva.fechaDesde),
    fechaHasta: new Date(reserva.fechaHasta),
    excluirReservaId: reserva.id,
  });
  if (conflictos.length) {
    const c = conflictos[0];
    throw error(
      `La habitación ${c.habitacion?.numero} no está disponible para todas las noches de la estadía ` +
        `(reserva ${c.reserva?.codigoConfirmacion}).`,
      409,
      "CAMBIO_HABITACION_INVALIDO",
      { habitacionIdAnterior: cambios.find((x) => x.habitacionId === c.habitacion?.id)?.anterior.id ?? null },
    );
  }
}

// Confirma el check-in en un solo paso (preparar + ejecutar). Quien necesite hacer algo en paralelo con las
// lecturas (por ejemplo, preautorizar la garantía) usa prepararConfirmacion: valida y lee todo FUERA de la
// transacción y devuelve la función que abre la transacción corta.
async function confirmarConOcupacion(reserva, params) {
  const ejecutar = await prepararConfirmacion(reserva, params);
  return ejecutar();
}

async function prepararConfirmacion(reserva, { operador, habitaciones, personas, totalEsperado, motivoTitularDistinto, corregirNombre }) {
  const quien = String(operador ?? "").trim();
  if (!quien) throw error("Falta identificar al usuario que confirma el check-in. Volvé a iniciar sesión.", 400);
  const esperado = Number(totalEsperado);
  if (totalEsperado === undefined || totalEsperado === null || totalEsperado === "" || !Number.isFinite(esperado) || esperado < 0)
    throw error("Falta el total que se le informó al huésped. Volvé a cargar la cotización.", 400, "PRECIO_CAMBIO");

  const filas = normalizarHabitaciones(reserva, habitaciones);
  const cambios = filas.filter((f) => f.habitacionId !== f.anterior.id);
  // Datos de las habitaciones nuevas para validar la ocupación antes de abrir la transacción.
  const nuevas = cambios.length
    ? await prisma.habitacion.findMany({ where: { id: { in: cambios.map((c) => c.habitacionId) } } })
    : [];
  const definitivas = filas.map((f) => {
    const nueva = nuevas.find((h) => h.id === f.habitacionId);
    return {
      habitacionId: f.habitacionId,
      numero: nueva?.numero ?? f.anterior.numero,
      capacidad: nueva?.capacidad ?? f.anterior.capacidad,
      adultos: f.adultos,
      menores: f.menores,
    };
  });

  const validacion = validarOcupacionIngreso({
    habitaciones: definitivas,
    personas,
    fechaIngreso: new Date(reserva.fechaDesde),
    huespedReserva: reserva.huesped,
    motivoTitularDistinto,
  });
  if (validacion.hayErrores)
    throw error(resumirErrores(validacion.errores), 400, "OCUPACION_INVALIDA", validacion.errores);
  if (validacion.faltaMotivo)
    throw error(
      `${reserva.huesped?.nombre ?? "Quien reservó"} no figura como titular de ninguna habitación. ` +
        "Indicá el motivo (por ejemplo, reservó para otra persona).",
      400,
      "MOTIVO_TITULAR_REQUERIDO",
    );

  const reservaId = reserva.id;
  const cambioOcupacion = filas.some((f) => f.adultos !== f.anterior.adultos || f.menores !== f.anterior.menores);
  const ocupacionParaPrecio = filas.map((f) => ({ habitacionId: f.anterior.id, adultos: f.adultos, menores: f.menores }));

  // ---- FUERA de la transacción: todo lo que no necesita bloqueo ----
  if (cambios.length) validarDatosDeLasHabitacionesNuevas(reserva, cambios, nuevas);

  // Reserva "en memoria" con la ocupación final: sirve para validar a cada persona y la ocupación del ingreso
  // sin volver a leer la base.
  const reservaFinal = {
    id: reservaId,
    fechaDesde: new Date(reserva.fechaDesde),
    fechaHasta: new Date(reserva.fechaHasta),
    huesped: reserva.huesped,
    reservaHabitaciones: definitivas.map((d) => ({
      habitacionId: d.habitacionId,
      adultos: d.adultos,
      menores: d.menores,
      habitacion: { numero: d.numero, capacidad: d.capacidad },
    })),
  };

  // Tres grupos de lecturas independientes, en paralelo (con la base remota, el tiempo es lo que cuesta cada ida y
  // vuelta): el total de la reserva y su cotización con la ocupación final, las fichas Previstas que se reemplazan,
  // y la validación de las personas (quién ya está alojado y qué fichas existen por documento).
  const [precio, previas, lote] = await Promise.all([
    (async () => {
      const filasReserva = await prisma.reservaHabitacion.findMany({ where: { reservaId }, select: { id: true, habitacionId: true } });
      const sumaActual = await prisma.reservaNoche.aggregate({
        where: { reservaHabitacionId: { in: filasReserva.map((rh) => rh.id) } },
        _sum: { precioNoche: true },
      });
      const previa = cambioOcupacion
        ? await reservasServicio.modificarReserva(reservaId, { habitaciones: ocupacionParaPrecio, soloPrevia: true }, prisma)
        : null;
      return { filasReserva, totalActual: Number(sumaActual._sum.precioNoche ?? 0), previa };
    })(),
    prisma.ocupanteReserva.findMany({ where: { reservaId, estado: "Previsto" }, select: { id: true } }),
    prepararLote(prisma, reservaFinal, personas, { permisoNombre: { esAdmin: corregirNombre === true, usuario: quien, reservaId } }),
  ]);
  const { filasReserva, totalActual, previa } = precio;
  // Precio con la ocupación final, comparado ANTES de abrir la transacción (y de escribir nada).
  const totalNuevo = previa ? previa.totalNuevo : totalActual;
  if (centavos(totalNuevo) !== centavos(esperado))
    throw error(
      `El total cambió: se informaron $${esperado} y con la ocupación actual corresponde $${totalNuevo}. ` +
        "Revisá la cotización con el huésped y volvé a confirmar.",
      409,
      "PRECIO_CAMBIO",
      {
        totalAnterior: esperado,
        totalNuevo,
        diferencia: Number((totalNuevo - esperado).toFixed(2)),
        mensajeNoReembolsable: previa?.mensajeNoReembolsable ?? null,
      },
    );

  const titulares = personas.filter((p) => p.esTitular === true);
  const eventosExtra = [
    ...previas.map((o) => ({ accion: "cancelar", detalle: { ocupanteId: o.id, motivo: MOTIVO_REEMPLAZO } })),
    ...(validacion.titularDistinto
      ? [
          {
            accion: "Titular distinto del de la reserva",
            detalle: {
              motivo: String(motivoTitularDistinto).trim(),
              huespedReservaId: reserva.huespedId,
              titulares: titulares.map((p) => ({
                nombre: `${p.nombre} ${p.apellido}`.trim(),
                documento: `${p.tipoDocumento} ${p.numeroDocumento}`,
                habitacionId: Number(p.habitacionId),
              })),
            },
          },
        ]
      : []),
  ];

  // ---- DENTRO de la transacción: solo bloqueo/condición, escrituras agrupadas y lo que necesita atomicidad ----
  const { ocuparHabitaciones, conConcurrenciaComo409 } = require("./checkIn.servicio");
  return async function ejecutar() {
  try {
    await conConcurrenciaComo409(() =>
      prisma.$transaction(async (tx) => {
        // 1) La reserva. Sin cambio de ocupación, un solo updateMany condicional (Confirmada → En curso) hace de
        //    bloqueo y de verificación de estado: si otra operación ya la pasó a En curso, count = 0.
        if (cambioOcupacion || cambios.length) {
          await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${reservaId} FOR UPDATE`;
          if (cambios.length) {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM reservas_habitaciones WHERE habitacionId IN (${Prisma.join(cambios.map((c) => c.habitacionId))}) FOR UPDATE`,
            );
            await validarConflictosDeCambios(tx, reserva, cambios);
          }
          if (cambioOcupacion) await reservasServicio.modificarReserva(reservaId, { habitaciones: ocupacionParaPrecio }, tx);
        }
        const { count } = await tx.reserva.updateMany({
          where: { id: reservaId, estado: "Confirmada" },
          data: { estado: "En curso" },
        });
        if (count !== 1) throw new ReservaYaNoConfirmada();

        // 2) Habitación definitiva: una sola sentencia para todas las que cambian.
        if (cambios.length) {
          const aMover = filasReserva.filter((rh) => cambios.some((c) => c.anterior.id === rh.habitacionId));
          const casos = aMover.map(
            (rh) => Prisma.sql`WHEN ${rh.id} THEN ${cambios.find((c) => c.anterior.id === rh.habitacionId).habitacionId}`,
          );
          await tx.$executeRaw(
            Prisma.sql`UPDATE reservas_habitaciones SET habitacionId = CASE id ${Prisma.join(casos, " ")} END WHERE id IN (${Prisma.join(aMover.map((rh) => rh.id))})`,
          );
        }

        // 3) Baja lógica de las fichas anteriores (2 sentencias, sin importar cuántas sean).
        if (previas.length) {
          const ids = previas.map((p) => p.id);
          await tx.ocupanteReserva.updateMany({ where: { id: { in: ids } }, data: { estado: "Cancelado" } });
          await tx.asignacionOcupanteHabitacion.updateMany({ where: { ocupanteId: { in: ids }, hasta: null }, data: { hasta: new Date() } });
        }

        // 4) Fichas, ocupantes (ya Alojado), asignaciones y eventos: cantidad fija de consultas.
        await escribirLote(tx, {
          reserva: reservaFinal,
          reservaId,
          fichas: lote.fichas,
          identidades: lote.identidades,
          huespedesExistentes: lote.huespedesExistentes,
          extras: lote.extras,
          renombres: lote.renombres,
          menoresReutilizados: lote.menoresReutilizados,
          permisoNombre: { esAdmin: corregirNombre === true, usuario: quien, reservaId },
          operador: quien,
          eventosExtra,
        });

        // 5) Las habitaciones definitivas pasan a ocupadas (condicional por estado).
        await ocuparHabitaciones(
          tx,
          filas.map((f) => f.habitacionId),
        );
      }, OPCIONES_TRANSACCION_LARGA),
    );
  } catch (err) {
    if (esDuplicadoDeIdentidadActiva(err)) {
      // La misma persona ya figura alojada (otro check-in ganó): mismo 409 y mensaje de siempre, con los nombres.
      await rechazarYaAlojadas(prisma, lote.fichas);
      throw error(MENSAJE_YA_ALOJADA, 409, "PERSONA_ALOJADA");
    }
    throw err;
  }
  };
}

// El updateMany condicional no encontró la reserva "Confirmada": otra operación ya la confirmó (o la canceló).
class ReservaYaNoConfirmada extends Error {
  constructor() {
    super("La reserva ya no está confirmada.");
  }
}

module.exports = { confirmarConOcupacion, prepararConfirmacion, normalizarHabitaciones, MOTIVO_REEMPLAZO, ReservaYaNoConfirmada };
