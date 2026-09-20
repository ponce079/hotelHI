import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { actualizarEstadoHabitacion } from "./habitaciones.api";
import { ESTADO_HABITACION_LABEL, LIMITES_HABITACION, TRANSICIONES_MANUALES_VALIDAS } from "./habitaciones.constantes";

// Housekeeping sigue acotado a estas dos, además de lo que ya permite la
// matriz para el estado actual (HU-35: "en limpieza → libre" es el ejemplo
// del backlog) — es una restricción de ROL, aparte de la de TRANSICIÓN.
const DESTINOS_HOUSEKEEPING = ["en limpieza", "libre"];

// Por qué no hay ningún destino manual válido — solo pasa con "ocupada"
// (requiere check-out real) y "mantenimiento" (requiere resolver la orden).
// Ver TRANSICIONES_MANUALES_VALIDAS: son los dos únicos estados con lista
// vacía.
const MENSAJE_SIN_DESTINOS = {
  ocupada: 'Esta habitación está ocupada. El cambio de estado ocurre en el check-out — no hay ninguna transición manual disponible desde acá.',
  mantenimiento: 'Esta habitación está en mantenimiento. La única salida es resolver la orden correspondiente desde el historial de mantenimiento.',
};

export function EstadoHabitacionModal({ habitacion, soloHousekeeping, onClose, onExito }) {
  const destinosValidos = TRANSICIONES_MANUALES_VALIDAS[habitacion.estado] ?? [];
  const opciones = soloHousekeeping ? destinosValidos.filter((d) => DESTINOS_HOUSEKEEPING.includes(d)) : destinosValidos;
  const [estado, setEstado] = useState(opciones[0] ?? "");
  // Motivo obligatorio solo al bloquear (mismo patrón que el motivo de
  // cancelación de una reserva) — ninguna otra transición lo pide.
  const [motivoBloqueo, setMotivoBloqueo] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const bloqueando = estado === "bloqueada";

  const mutacion = useMutation({
    mutationFn: () => actualizarEstadoHabitacion(habitacion.id, estado, bloqueando ? motivoBloqueo.trim() : undefined),
    onSuccess: (actualizada) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      onExito(`Habitación ${actualizada.numero}: estado actualizado a ${ESTADO_HABITACION_LABEL[actualizada.estado].toLowerCase()}.`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudo actualizar el estado."),
  });

  return (
    <Modal titulo={`Estado de habitación ${habitacion.numero}`} subtitulo="El cambio será visible en el panel al confirmarlo" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutacion.mutate(); }}>
        <div className="flex flex-col gap-4 px-6 py-5">
          {error && <p className="text-sm text-error-texto">{error}</p>}

          {opciones.length === 0 ? (
            <p className="rounded-md bg-hueso px-3.5 py-3 text-[13px] text-tinta">
              {MENSAJE_SIN_DESTINOS[habitacion.estado] ?? "Esta habitación no tiene ninguna transición manual disponible desde acá."}
            </p>
          ) : (
            <>
              <Select label="Nuevo estado *" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {opciones.map((opcion) => <option key={opcion} value={opcion}>{ESTADO_HABITACION_LABEL[opcion]}</option>)}
              </Select>
              {soloHousekeeping && (
                <p className="rounded-md bg-info-suave px-3 py-2 text-xs text-info-texto">
                  Housekeeping puede marcar la habitación en limpieza o liberarla al terminar.
                </p>
              )}
              {bloqueando && (
                <label className="flex flex-col gap-1.5 font-body text-sm">
                  <span className="text-[12px] text-tinta/70">Motivo del bloqueo *</span>
                  <textarea
                    rows={3}
                    value={motivoBloqueo}
                    onChange={(e) => setMotivoBloqueo(e.target.value)}
                    maxLength={LIMITES_HABITACION.motivoBloqueo}
                    placeholder="Reforma de baño, aire acondicionado roto, etc."
                    className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
                  />
                  {!motivoBloqueo.trim() && <span className="text-[11.5px] text-piedra">Sin motivo no se puede bloquear la habitación.</span>}
                </label>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            {opciones.length === 0 ? "Cerrar" : "Cancelar"}
          </Button>
          {opciones.length > 0 && (
            <Button
              type="submit"
              icono={Check}
              cargando={mutacion.isPending}
              disabled={!estado || (bloqueando && !motivoBloqueo.trim())}
            >
              Confirmar estado
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
