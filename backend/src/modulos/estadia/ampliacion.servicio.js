const { createHash } = require("node:crypto");
const estadia = require("./estadia.servicio");
const { EDAD_ADULTO_OCUPACION } = require("../../lib/fechas");

// Se ejecuta con la reserva bloqueada y dentro de la transacción del check-in.
async function ampliarSiCorresponde(tx, reservaId, confirmacion) {
  const reservas = require("../reservas/reservas.servicio");
  const hoy = reservas.hoyComoFechaUTC();
  const personas = await tx.ocupanteReserva.findMany({
    where: {
      reservaId,
      estado: "Previsto",
      fechaDesde: { lte: hoy },
      fechaHasta: { gt: hoy },
    },
    include: estadia.includePersona,
  });
  const actuales = await tx.reservaHabitacion.findMany({
    where: { reservaId },
    include: { habitacion: true },
  });
  let ampliar = false;
  const habitaciones = actuales.map((rh) => {
    const presentes = personas.filter((p) =>
      p.asignaciones.some((a) => !a.hasta && a.habitacionId === rh.habitacionId),
    );
    if (presentes.length > rh.habitacion.capacidad)
      throw new estadia.ErrorDeNegocio("La cantidad de personas supera la capacidad de la habitación.", 409);
    if (presentes.length <= rh.adultos + rh.menores)
      return {
        habitacionId: rh.habitacionId,
        adultos: rh.adultos,
        menores: rh.menores,
      };
    ampliar = true;
    for (const persona of presentes) estadia.validarCompleto(persona);
    const menores = presentes.filter((p) => estadia.edad(p.fechaNacimiento, p.fechaDesde) < EDAD_ADULTO_OCUPACION).length;
    return {
      habitacionId: rh.habitacionId,
      adultos: presentes.length - menores,
      menores,
    };
  });
  if (!ampliar) return;
  const previa = await reservas.modificarReserva(reservaId, { habitaciones, soloPrevia: true }, tx);
  const token = createHash("sha256").update(JSON.stringify({ reservaId, habitaciones, previa })).digest("hex");
  if (confirmacion !== token) {
    const error = new estadia.ErrorDeNegocio(
      "Ingresan más personas que las reservadas. Revisá y confirmá la nueva cotización para continuar.",
      409,
    );
    error.codigo = "AMPLIACION_OCUPACION_REQUIERE_CONFIRMACION";
    error.detalle = { ...previa, habitaciones, token };
    throw error;
  }
  await reservas.modificarReserva(reservaId, { habitaciones }, tx);
}

module.exports = { ampliarSiCorresponde };
