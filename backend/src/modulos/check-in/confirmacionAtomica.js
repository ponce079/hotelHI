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
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const reservasServicio = require("../reservas/reservas.servicio");
const estadia = require("../estadia/estadia.servicio");
const { cargarPersonasEnLote } = require("../estadia/cargaMasiva");
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
  if (new Set(definitivas).size !== definitivas.length)
    throw error("La misma habitación quedó elegida para dos habitaciones de la reserva.", 409, "CAMBIO_HABITACION_INVALIDO");
  return resultado;
}

// Reglas del cambio de habitación al ingresar: mismo tipo, activa, libre, no incluida ya en la
// reserva y sin otra reserva encimada en ninguna noche de la estadía.
async function validarCambiosDeHabitacion(cliente, reserva, cambios, nuevas) {
  const idsReserva = new Set(reserva.habitaciones.map((h) => h.id));
  const porId = new Map(nuevas.map((h) => [h.id, h]));
  for (const { anterior, habitacionId } of cambios) {
    const nueva = porId.get(habitacionId);
    const quien = `la habitación ${anterior.numero}`;
    if (!nueva || !nueva.activo)
      throw error(`La habitación elegida para reemplazar a ${quien} no existe o está dada de baja.`, 409, "CAMBIO_HABITACION_INVALIDO");
    if (idsReserva.has(habitacionId))
      throw error(`La habitación ${nueva.numero} ya forma parte de esta reserva.`, 409, "CAMBIO_HABITACION_INVALIDO");
    if (nueva.tipoHabitacionId !== anterior.tipoHabitacionId)
      throw error(
        `La habitación ${nueva.numero} es de otro tipo: solo se puede cambiar ${quien} por una del mismo tipo (${anterior.tipo}).`,
        409,
        "CAMBIO_HABITACION_INVALIDO",
      );
    if (!reservasServicio.esLibreAhora(nueva))
      throw error(
        `La habitación ${nueva.numero} no está libre (estado actual: ${nueva.estado}).`,
        409,
        "CAMBIO_HABITACION_INVALIDO",
      );
  }
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
    );
  }
}

async function confirmarConOcupacion(reserva, { operador, habitaciones, personas, totalEsperado, motivoTitularDistinto }) {
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

  const { validarReservaVigente, ocuparHabitaciones, conConcurrenciaComo409 } = require("./checkIn.servicio");
  await conConcurrenciaComo409(() => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${reservaId} FOR UPDATE`;
    validarReservaVigente(await tx.reserva.findUnique({ where: { id: reservaId } }));

    // Cambio de habitación: lock preventivo de las filas de esas habitaciones (igual que el alta)
    // y validación con datos leídos dentro de la transacción.
    if (cambios.length) {
      const ids = cambios.map((c) => c.habitacionId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM reservas_habitaciones WHERE habitacionId IN (${Prisma.join(ids)}) FOR UPDATE`,
      );
      await validarCambiosDeHabitacion(tx, reserva, cambios, await tx.habitacion.findMany({ where: { id: { in: ids } } }));
    }

    // Precio con la ocupación final, comparado ANTES de escribir.
    const sumaActual = await tx.reservaNoche.aggregate({
      where: { reservaHabitacion: { reservaId } },
      _sum: { precioNoche: true },
    });
    const totalActual = Number(sumaActual._sum.precioNoche ?? 0);
    const previa = cambioOcupacion
      ? await reservasServicio.modificarReserva(reservaId, { habitaciones: ocupacionParaPrecio, soloPrevia: true }, tx)
      : null;
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
    if (cambioOcupacion) await reservasServicio.modificarReserva(reservaId, { habitaciones: ocupacionParaPrecio }, tx);

    // Habitación definitiva: una sola sentencia para todas las que cambian.
    if (cambios.length) {
      const filasReserva = await tx.reservaHabitacion.findMany({
        where: { reservaId, habitacionId: { in: cambios.map((c) => c.anterior.id) } },
        select: { id: true, habitacionId: true },
      });
      const casos = filasReserva.map(
        (rh) => Prisma.sql`WHEN ${rh.id} THEN ${cambios.find((c) => c.anterior.id === rh.habitacionId).habitacionId}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE reservas_habitaciones SET habitacionId = CASE id ${Prisma.join(casos, " ")} END WHERE id IN (${Prisma.join(filasReserva.map((rh) => rh.id))})`,
      );
    }

    // Baja lógica de las fichas que se cargaron antes (titular incorporado al reservar,
    // fichas cargadas desde la ficha de la reserva): las reemplaza la lista confirmada.
    const previas = await tx.ocupanteReserva.findMany({
      where: { reservaId, estado: "Previsto" },
      select: { id: true },
    });
    if (previas.length) {
      const ids = previas.map((p) => p.id);
      const ahora = new Date();
      await tx.ocupanteReserva.updateMany({ where: { id: { in: ids } }, data: { estado: "Cancelado" } });
      await tx.asignacionOcupanteHabitacion.updateMany({
        where: { ocupanteId: { in: ids }, hasta: null },
        data: { hasta: ahora },
      });
      await tx.eventoEstadia.createMany({
        data: ids.map((ocupanteId) => ({
          reservaId,
          accion: "cancelar",
          detalle: JSON.stringify({ ocupanteId, motivo: MOTIVO_REEMPLAZO }),
          operador: quien,
        })),
      });
    }

    await cargarPersonasEnLote(tx, reservaId, personas, quien);

    if (validacion.titularDistinto) {
      const titulares = personas.filter((p) => p.esTitular === true);
      await estadia.evento(
        tx,
        reservaId,
        "Titular distinto del de la reserva",
        {
          motivo: String(motivoTitularDistinto).trim(),
          huespedReservaId: reserva.huespedId,
          titulares: titulares.map((p) => ({
            nombre: `${p.nombre} ${p.apellido}`.trim(),
            documento: `${p.tipoDocumento} ${p.numeroDocumento}`,
            habitacionId: Number(p.habitacionId),
          })),
        },
        quien,
      );
    }

    await require("../estadia/ingreso").prepararIngreso(tx, reservaId, quien);
    await reservasServicio.marcarEnCurso(reservaId, tx);
    await ocuparHabitaciones(
      tx,
      filas.map((f) => f.habitacionId),
    );
  }, OPCIONES_TRANSACCION));
}

module.exports = { confirmarConOcupacion, MOTIVO_REEMPLAZO };
