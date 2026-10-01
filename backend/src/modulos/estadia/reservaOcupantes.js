// Mantiene las fichas coherentes cuando Reservas cambia habitaciones o fechas.
// El llamador conserva la cotización y la transacción del módulo de reservas.
async function sincronizarOcupantes(tx, actual, cambios, ErrorDeNegocio) {
  const { fechaDesde, fechaHasta, habitacionIds } = cambios;
  const ocupantes = await tx.ocupanteReserva.findMany({
    where: { reservaId: actual.id, estado: { in: ["Previsto", "Alojado"] } },
    include: { asignaciones: true },
  });
  const actualizar = [];
  for (const persona of ocupantes) {
    const asignada = persona.asignaciones.find((a) => !a.hasta);
    if (!asignada || !habitacionIds.includes(asignada.habitacionId)) {
      throw new ErrorDeNegocio(
        "Hay ocupantes asignados a una habitación que intentás quitar. Reasignalos o cancelá su ingreso antes de modificar la reserva.",
        409,
      );
    }
    if (
      +persona.fechaDesde === +actual.fechaDesde &&
      +persona.fechaHasta === +actual.fechaHasta
    ) {
      if (
        +fechaDesde !== +actual.fechaDesde ||
        +fechaHasta !== +actual.fechaHasta
      )
        actualizar.push(persona.id);
    } else if (
      persona.fechaDesde < fechaDesde ||
      persona.fechaHasta > fechaHasta
    ) {
      throw new ErrorDeNegocio(
        "Las fechas de un ocupante quedarían fuera de la reserva. Revisá su ficha antes de modificar las fechas.",
        409,
      );
    }
  }
  if (actualizar.length) {
    await tx.ocupanteReserva.updateMany({
      where: { id: { in: actualizar } },
      data: { fechaDesde, fechaHasta, verificadoEn: null, verificadoPor: null },
    });
  }
}

module.exports = { sincronizarOcupantes };
