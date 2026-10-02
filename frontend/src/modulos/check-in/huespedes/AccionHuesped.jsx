import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../componentes/Button";
import { formatearPrecio } from "../../../lib/moneda";
import { previaOcupacion } from "../checkIn.api";
import { ocupacionConCambio } from "../checkInPayload";
import { etiquetaFila, nombreDeFila, nombreHabitacion } from "../checkInReglas";

const conSigno = (n) => (n > 0 ? `+${formatearPrecio(n)}` : formatearPrecio(n));

// Texto de la diferencia de la vista previa: "+$ 22.000 por noche (+$ 66.000 en total)".
export function textoDiferencia(previa, agregando) {
  if (!previa) return "";
  if (previa.diferencia === 0) {
    if (previa.mensajeNoReembolsable) return "Tarifa no reembolsable: el precio no baja.";
    return agregando ? "Sin cargo adicional." : "No cambia el precio.";
  }
  const noches = previa.diferenciaPorNoche ?? [];
  const iguales = noches.length > 0 && noches.every((n) => n.diferencia === noches[0].diferencia);
  return iguales
    ? `${conSigno(noches[0].diferencia)} por noche (${conSigno(previa.diferencia)} en total).`
    : `${conSigno(previa.diferencia)} en total.`;
}

// Agregar o quitar un huésped de una habitación. Con reserva se recotiza con la vista previa
// (nada se escribe hasta confirmar el check-in); "Cancelar" deja todo como estaba.
export function AccionHuesped({ estado, habitacion, dispatch }) {
  const accion = estado.accion?.habitacionClave === habitacion.clave ? estado.accion : null;
  const conReserva = estado.modo === "reserva";
  const fila = accion?.tipo === "quitar" ? estado.filas.find((f) => f.id === accion.filaId) : null;
  const delta =
    accion?.tipo === "agregar"
      ? { deltaAdultos: accion.rol === "adulto" ? 1 : 0, deltaMenores: accion.rol === "menor" ? 1 : 0 }
      : fila
        ? { deltaAdultos: fila.tipo === "adulto" ? -1 : 0, deltaMenores: fila.tipo === "menor" ? -1 : 0 }
        : null;
  const personas = delta ? habitacion.adultos + habitacion.menores + delta.deltaAdultos + delta.deltaMenores : 0;
  const excede = accion?.tipo === "agregar" && habitacion.capacidad != null && personas > habitacion.capacidad;
  const ocupacion = delta ? ocupacionConCambio(estado, { habitacionClave: habitacion.clave, ...delta }) : null;
  const previa = useQuery({
    queryKey: ["check-in", "previa", estado.reservaId, JSON.stringify(ocupacion)],
    queryFn: () => previaOcupacion(estado.reservaId, ocupacion),
    enabled: conReserva && Boolean(delta) && !excede,
    retry: false,
  });

  const panel = "mt-1 flex flex-wrap items-center gap-3 rounded-[12px] px-3.5 py-3";
  if (!accion) {
    return (
      <div className={`${panel} border border-dashed border-borde`}>
        <Button variante="secundario" onClick={() => dispatch({ tipo: "abrirAccion", accion: { tipo: "elegir", habitacionClave: habitacion.clave } })}>
          ＋ Agregar huésped
        </Button>
        <span className="text-[13px] text-piedra">Para quien no estaba en la reserva. Se recotiza antes de sumarlo.</span>
      </div>
    );
  }
  const cancelar = (
    <Button variante="fantasma" onClick={() => dispatch({ tipo: "cancelarAccion" })}>
      Cancelar
    </Button>
  );
  if (accion.tipo === "elegir") {
    return (
      <div className={`${panel} border border-pino-200 bg-pino-100`}>
        <span className="min-w-[200px] flex-1">¿A quién agregás en la {nombreHabitacion(estado, habitacion.clave)}?</span>
        <Button variante="secundario" onClick={() => dispatch({ tipo: "abrirAccion", accion: { tipo: "agregar", rol: "adulto", habitacionClave: habitacion.clave } })}>
          Adulto (13 años o más)
        </Button>
        <Button variante="secundario" onClick={() => dispatch({ tipo: "abrirAccion", accion: { tipo: "agregar", rol: "menor", habitacionClave: habitacion.clave } })}>
          Menor (0 a 12 años)
        </Button>
        {cancelar}
      </div>
    );
  }

  const quien = fila ? `${etiquetaFila(estado, fila)}${nombreDeFila(fila) ? ` (${nombreDeFila(fila)})` : ""}` : "";
  let mensaje;
  if (excede) {
    mensaje = `La ${nombreHabitacion(estado, habitacion.clave)} admite hasta ${habitacion.capacidad} personas. Para sumar a alguien más, cambiá de habitación.`;
  } else if (!conReserva) {
    mensaje = accion.tipo === "agregar" ? `Se agrega 1 ${accion.rol}. El total se actualiza con la cotización.` : `Se quita a ${quien}. El total se actualiza con la cotización.`;
  } else if (previa.isLoading) {
    mensaje = "Calculando el nuevo total…";
  } else if (previa.isError) {
    mensaje = previa.error?.response?.data?.error ?? "No se pudo calcular el nuevo total.";
  } else {
    const base = accion.tipo === "agregar" ? `Se agrega 1 ${accion.rol} en la ${nombreHabitacion(estado, habitacion.clave)}:` : `Se quita a ${quien}:`;
    mensaje = [base, textoDiferencia(previa.data, accion.tipo === "agregar"), previa.data?.mensajeAjustePerdido].filter(Boolean).join(" ");
  }
  const puedeConfirmar = !excede && (!conReserva || previa.isSuccess);
  const confirmar = () => {
    const totalNuevo = conReserva ? previa.data.totalNuevo : undefined;
    if (accion.tipo === "agregar") dispatch({ tipo: "agregarHuesped", habitacionClave: habitacion.clave, rol: accion.rol, totalNuevo });
    else dispatch({ tipo: "quitarHuesped", filaId: fila.id, totalNuevo });
  };
  return (
    <div role="status" className={`${panel} border border-pino-200 bg-pino-100`}>
      <span className="min-w-[240px] flex-1">{mensaje}</span>
      {excede && conReserva && (
        <Button variante="secundario" onClick={() => document.getElementById(`ci-hab-${habitacion.clave}`)?.scrollIntoView({ block: "center" })}>
          Cambiar habitación
        </Button>
      )}
      {puedeConfirmar && (
        <Button variante="ok" onClick={confirmar}>
          Confirmar y recotizar
        </Button>
      )}
      {cancelar}
    </div>
  );
}
