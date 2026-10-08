// Cuerpos de los envíos del check-in (contratos en docs/PR_CHECKIN_REDISENO_ETAPA1.md). Se envían
// los valores reales ya resueltos (con la herencia aplicada): nunca un campo "heredado" vacío.
import { ddMmAaaaAISO } from "../../lib/fechas";
import { MOTIVO_MENOR_SIN_DOCUMENTO } from "./checkInPantalla.constantes";
import { necesitaMotivo, necesitaResponsable, resolverCampos, responsableDe } from "./checkInReglas";

const texto = (v) => String(v ?? "").trim();

export function personasParaEnviar(estado, contexto) {
  return estado.filas.map((fila) => {
    const { campos } = resolverCampos(estado, fila);
    const habitacion = estado.habitaciones.find((h) => h.clave === fila.habitacionClave);
    const sinDocumento = fila.tipo === "menor" && !texto(campos.numeroDocumento);
    const responsable = necesitaResponsable(fila, contexto) ? responsableDe(estado, fila) : null;
    return {
      id: fila.id,
      habitacionId: habitacion.habitacionId,
      esTitular: fila.tipo === "adulto" && fila.esTitular,
      responsableId: responsable?.id ?? null,
      nombre: texto(campos.nombre),
      apellido: texto(campos.apellido),
      tipoDocumento: sinDocumento ? null : campos.tipoDocumento,
      paisDocumento: sinDocumento ? null : campos.paisDocumento,
      numeroDocumento: sinDocumento ? null : texto(campos.numeroDocumento),
      motivoSinDocumento: sinDocumento ? MOTIVO_MENOR_SIN_DOCUMENTO : null,
      fechaNacimiento: ddMmAaaaAISO(campos.fechaNacimiento),
      nacionalidad: campos.nacionalidad || null,
      paisResidencia: campos.paisResidencia || null,
      localidad: texto(campos.localidad) || null,
      domicilio: texto(campos.domicilio) || null,
      telefono: texto(campos.telefono) || null,
      email: texto(campos.email) || null,
      // Vínculo del responsable con el menor (solo menores de 18) y autorización presentada.
      vinculoResponsable: responsable ? campos.vinculoResponsable || null : null,
      autorizacionPresentada: responsable ? campos.autorizacionPresentada === true : false,
      // Casilla "Actualizar la ficha del huésped con estos datos": sin ella la ficha existente no se pisa.
      actualizarFicha: fila.actualizarFicha === true,
    };
  });
}

// POST /api/check-in/:id/confirmar (con reserva).
export function cuerpoConfirmarReserva(estado, contexto, { operador, totalEsperado }) {
  return {
    operador,
    habitaciones: estado.habitaciones.map((h) => ({
      habitacionIdAnterior: h.habitacionIdAnterior,
      habitacionId: h.habitacionId,
      adultos: h.adultos,
      menores: h.menores,
    })),
    personas: personasParaEnviar(estado, contexto),
    totalEsperado: totalEsperado ?? estado.totalVigente,
    ...(necesitaMotivo(estado, contexto) ? { motivoTitularDistinto: texto(estado.motivoTitularDistinto) } : {}),
    ...estado.garantia,
    // Un reintento tras un rechazo es otro intento: clave nueva en cada envío.
    claveIdempotencia: crypto.randomUUID(),
  };
}

// POST /api/check-in/walk-in. Sin `huesped`: el backend lo arma con el titular de la primera habitación.
export function cuerpoWalkin(estado, contexto, { operador, planTarifarioId, totalEsperado }) {
  return {
    operador,
    fechaHasta: String(contexto.fechaHasta).slice(0, 10),
    habitaciones: estado.habitaciones.map((h) => ({ habitacionId: h.habitacionId, adultos: h.adultos, menores: h.menores })),
    planTarifarioId,
    totalEsperado,
    personas: personasParaEnviar(estado, contexto),
    ...estado.garantia,
    claveIdempotencia: crypto.randomUUID(),
  };
}

// Ocupación de TODAS las habitaciones para la vista previa, con un cambio aplicado.
export function ocupacionConCambio(estado, { habitacionClave, deltaAdultos = 0, deltaMenores = 0 }) {
  return estado.habitaciones.map((h) => ({
    habitacionIdAnterior: h.habitacionIdAnterior,
    habitacionId: h.habitacionId,
    adultos: h.adultos + (h.clave === habitacionClave ? deltaAdultos : 0),
    menores: h.menores + (h.clave === habitacionClave ? deltaMenores : 0),
  }));
}
