// Mover a una persona alojada a otra habitación de la MISMA reserva (acción aparte de "Editar").
// Respeta la capacidad y la regla de un titular por habitación: si se mueve al titular y en la
// habitación que deja quedan otras personas, hay que indicar quién pasa a ser el titular de esa
// habitación. El motivo es obligatorio y queda en el historial.
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const { MAYORIA_EDAD } = require("../../lib/fechas");
const prisma = require("../../lib/prisma");
const estadia = require("./estadia.servicio");
const { titularActivo } = require("./titularHabitacion");

const ACTIVOS = ["Previsto", "Alojado"];

async function mover(reservaId, ocupanteId, data = {}) {
  const { ErrorDeNegocio, idValido: id, bloquear, evento, edad, includePersona } = estadia;
  reservaId = id(reservaId);
  const operador = String(data.operador ?? "").trim();
  if (!operador) throw new ErrorDeNegocio("Operador: valor inválido.");
  const motivo = String(data.motivo ?? "").trim();
  if (!motivo || motivo.length > 500)
    throw new ErrorDeNegocio("Indicá el motivo del cambio de habitación.", 400, {
      motivo: "Indicá el motivo del cambio de habitación.",
    });
  return prisma.$transaction(async (tx) => {
    const r = await bloquear(tx, reservaId);
    if (r.estado !== "En curso")
      throw new ErrorDeNegocio("Solo se mueve de habitación a una persona con la estadía en curso.", 409);
    const p = await tx.ocupanteReserva.findFirst({ where: { id: id(ocupanteId), reservaId }, include: includePersona });
    if (!p) throw new ErrorDeNegocio("Ocupante inexistente.", 404);
    if (p.estado !== "Alojado") throw new ErrorDeNegocio("La persona no está alojada.", 409);
    const asignacion = p.asignaciones.find((a) => !a.hasta);
    const destinoId = id(data.habitacionId);
    const destino = r.reservaHabitaciones.find((h) => h.habitacionId === destinoId);
    if (!destino) throw new ErrorDeNegocio("La habitación de destino no pertenece a esta reserva.", 400);
    if (destinoId === asignacion?.habitacionId) throw new ErrorDeNegocio("La persona ya está en esa habitación.");
    if (!["ocupada", "libre"].includes(destino.habitacion.estado))
      throw new ErrorDeNegocio("La habitación de destino no está disponible.", 409);
    const enDestino = await tx.ocupanteReserva.findMany({
      where: { reservaId, estado: { in: ACTIVOS }, id: { not: p.id }, asignaciones: { some: { habitacionId: destinoId, hasta: null } } },
    });
    estadia.verificarCapacidad(destino, p, enDestino);

    let nuevoTitularId = null;
    let sigueTitular = p.esTitular;
    if (p.esTitular && asignacion) {
      const quedan = await tx.ocupanteReserva.findMany({
        where: {
          reservaId,
          estado: { in: ACTIVOS },
          id: { not: p.id },
          asignaciones: { some: { habitacionId: asignacion.habitacionId, hasta: null } },
        },
      });
      if (quedan.length) {
        const elegido = quedan.find((q) => q.id === Number(data.nuevoTitularId));
        if (!elegido) {
          const mensaje = "Elegí quién queda como titular de la habitación que deja.";
          throw new ErrorDeNegocio(mensaje, 400, { nuevoTitularId: mensaje });
        }
        if (!elegido.fechaNacimiento || edad(elegido.fechaNacimiento, elegido.fechaDesde) < MAYORIA_EDAD)
          throw new ErrorDeNegocio("El nuevo titular de la habitación debe tener 18 años cumplidos.", 400, {
            nuevoTitularId: "El nuevo titular debe tener 18 años cumplidos.",
          });
        await tx.ocupanteReserva.update({ where: { id: elegido.id }, data: { esTitular: true } });
        nuevoTitularId = elegido.id;
      }
      // En la habitación de destino sigue habiendo un solo titular: si ya tiene uno, la persona
      // movida deja de serlo.
      if (await titularActivo(tx, reservaId, destinoId, p.id)) sigueTitular = false;
    }
    if (sigueTitular !== p.esTitular)
      await tx.ocupanteReserva.update({ where: { id: p.id }, data: { esTitular: sigueTitular } });
    if (asignacion)
      await tx.asignacionOcupanteHabitacion.update({ where: { id: asignacion.id }, data: { hasta: new Date() } });
    await tx.asignacionOcupanteHabitacion.create({ data: { ocupanteId: p.id, habitacionId: destinoId, motivo } });
    await evento(
      tx,
      reservaId,
      "Cambio de habitación",
      { ocupanteId: p.id, desdeHabitacionId: asignacion?.habitacionId ?? null, habitacionId: destinoId, motivo, nuevoTitularId },
      operador,
    );
    return { ok: true, nuevoTitularId, esTitular: sigueTitular };
  }, OPCIONES_TRANSACCION);
}

module.exports = { mover };
