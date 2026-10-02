// El mismo listado explica y controla la habilitación: no debe existir un
// botón deshabilitado por una condición que la pantalla no esté mostrando.
export function bloqueosCheckIn({ resultado, titularPreparado, ocupantes, resumen, form }) {
  if (!resultado?.reserva) return ["Buscá y seleccioná una reserva para iniciar el check-in."];
  const motivos = [];
  if (!resultado.puedeIniciarCheckIn)
    motivos.push(resultado.motivoBloqueo || "La reserva todavía no está habilitada para el check-in.");
  if (!titularPreparado)
    motivos.push(
      "Falta terminar la incorporación del titular. " +
        "Revisá el aviso en Personas de la estadía y reintentá si hubo un error.",
    );
  if (ocupantes.isError)
    motivos.push("No se pudo actualizar el listado de ocupantes. Usá «Volver a cargar» en Personas de la estadía.");
  else if (!ocupantes.isSuccess || ocupantes.isFetching) motivos.push("Esperá mientras se actualizan los ocupantes.");
  else {
    if (!resumen.length) motivos.push("La reserva no tiene habitaciones asignadas.");
    for (const h of resumen) {
      const cantidad = h.esperadas;
      if (!Number.isSafeInteger(cantidad) || cantidad < 1)
        motivos.push(`Habitación ${h.numero}: revisá los adultos y menores de la reserva.`);
      else if (cantidad > h.capacidad)
        motivos.push(`Habitación ${h.numero}: la ocupación reservada supera la capacidad de ${h.capacidad} personas.`);
      else if (cantidad !== h.registradas && !h.ampliable)
        motivos.push(
          `Habitación ${h.numero}: hay ${cantidad} personas reservadas y ${h.registradas} registradas para hoy. ` +
            "Completá las fichas o modificá la reserva y revisá su cotización.",
        );
      if (!h.edadesCoinciden && !h.ampliable)
        motivos.push(
          `Habitación ${h.numero}: completá las fechas de nacimiento y ` +
            "verificá que coincidan con los adultos y menores reservados.",
        );
      if (h.titulares !== 1) motivos.push(`Habitación ${h.numero}: seleccioná exactamente un titular adulto.`);
      if (h.verificadas < h.registradas)
        motivos.push(
          `Habitación ${h.numero}: ${h.registradas - h.verificadas} persona(s) pendiente(s) de verificar. ` +
            "Completá sus datos y presioná «Verificar datos» en cada ficha; guardar no las verifica.",
        );
    }
  }
  if (!form.documento.trim()) motivos.push("Ingresá el documento presentado por el titular.");
  if (!form.garantiaConfirmada)
    motivos.push("Confirmá la recepción de la garantía o autorizá la tarjeta, según el medio elegido.");
  return motivos;
}
