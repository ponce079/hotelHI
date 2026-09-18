import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { actualizarEstadoHabitacion } from "./habitaciones.api";
import { ESTADOS_HABITACION, ESTADO_HABITACION_LABEL } from "./habitaciones.constantes";

export function EstadoHabitacionModal({ habitacion, soloHousekeeping, onClose, onExito }) {
  const opciones = soloHousekeeping ? ["en limpieza", "libre"] : ESTADOS_HABITACION;
  const estadoInicial = opciones.includes(habitacion.estado) ? habitacion.estado : opciones[0];
  const [estado, setEstado] = useState(estadoInicial);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => actualizarEstadoHabitacion(habitacion.id, estado),
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
          <Select label="Nuevo estado *" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {opciones.map((opcion) => <option key={opcion} value={opcion}>{ESTADO_HABITACION_LABEL[opcion]}</option>)}
          </Select>
          {soloHousekeeping && (
            <p className="rounded-md bg-info-suave px-3 py-2 text-xs text-info-texto">
              Housekeeping puede marcar la habitación en limpieza o liberarla al terminar.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>Cancelar</Button>
          <Button type="submit" icono={Check} cargando={mutacion.isPending} disabled={estado === habitacion.estado}>Confirmar estado</Button>
        </div>
      </form>
    </Modal>
  );
}
