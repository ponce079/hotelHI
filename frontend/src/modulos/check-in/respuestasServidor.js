// Cómo se muestra en pantalla cada respuesta de error del confirmar (contratos de la etapa 1).
// Devuelve el panel de la barra y lo que se marca en habitaciones y filas.
export function interpretarErrorConfirmar(error, estado) {
  const status = error?.response?.status;
  const datos = error?.response?.data ?? {};
  const mensaje = datos.error ?? "No se pudo confirmar el check-in. Revisá la conexión y volvé a intentar.";
  const claveDe = (habitacionId) => estado.habitaciones.find((h) => h.habitacionId === habitacionId || h.habitacionIdAnterior === habitacionId)?.clave;
  // porHabitacion: errores de la habitación en sí (cambio de habitación); ocupacionPorHabitacion: de las
  // personas que ingresan (se muestran en el grupo de huéspedes de esa habitación).
  const resultado = { panel: { tipo: "mensaje", texto: mensaje }, porHabitacion: {}, ocupacionPorHabitacion: {}, personas: [], mensajePersonas: null, recargarHabitaciones: false };

  if (status === 400 && (datos.codigo === "OCUPACION_INVALIDA" || datos.codigo === "MOTIVO_TITULAR_REQUERIDO")) {
    const porHabitacion = datos.detalle?.porHabitacion ?? [];
    const generales = datos.detalle?.generales ?? [];
    for (const h of porHabitacion) {
      const clave = claveDe(h.habitacionId);
      if (clave && h.errores?.length) resultado.ocupacionPorHabitacion[clave] = h.errores.join(" ");
    }
    const mensajes = [...porHabitacion.flatMap((h) => h.errores ?? []), ...generales];
    resultado.panel = { tipo: "lista", titulo: "El servidor no aceptó la carga:", mensajes: mensajes.length ? mensajes : [mensaje] };
    return resultado;
  }
  if (status === 409 && datos.codigo === "PRECIO_CAMBIO") {
    resultado.panel = { tipo: "precio", detalle: datos.detalle };
    return resultado;
  }
  if (status === 409 && datos.codigo === "CAMBIO_HABITACION_INVALIDO") {
    const clave = claveDe(datos.detalle?.habitacionIdAnterior);
    if (clave) resultado.porHabitacion[clave] = mensaje;
    resultado.recargarHabitaciones = true;
    return resultado;
  }
  if (status === 409 && datos.codigo === "PERSONA_ALOJADA") {
    resultado.personas = datos.detalle?.personas ?? [];
    resultado.mensajePersonas = mensaje;
    return resultado;
  }
  // Otra habitación tomada (walk-in) u otro conflicto: se recarga la disponibilidad.
  if (status === 409) resultado.recargarHabitaciones = true;
  return resultado;
}
