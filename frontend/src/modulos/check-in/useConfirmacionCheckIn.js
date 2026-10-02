import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { interpretarErrorConfirmar } from "./respuestasServidor";

// Envío único del check-in. Un doble clic no genera dos envíos: además del botón deshabilitado,
// una marca en memoria descarta cualquier envío mientras hay uno en curso.
export function useConfirmacionCheckIn({ enviar, estado, dispatch, onExito }) {
  const queryClient = useQueryClient();
  const enCurso = useRef(false);
  const [panel, setPanel] = useState(null);
  const mutacion = useMutation({
    mutationFn: (totalEsperado) => enviar(totalEsperado),
    onSuccess: (datos) => {
      setPanel(null);
      onExito?.(datos);
      for (const clave of [["check-in"], ["habitaciones"], ["reservas"], ["ocupantes"]]) queryClient.invalidateQueries({ queryKey: clave });
    },
    onError: (error) => {
      const r = interpretarErrorConfirmar(error, estado);
      setPanel(r.panel);
      dispatch({ tipo: "erroresServidor", porHabitacion: r.porHabitacion, personas: r.personas, mensajePersonas: r.mensajePersonas });
      if (r.recargarHabitaciones) queryClient.invalidateQueries({ queryKey: ["check-in", "libres"] });
    },
    onSettled: () => {
      enCurso.current = false;
    },
  });
  const confirmar = (totalEsperado) => {
    if (enCurso.current) return;
    enCurso.current = true;
    setPanel(null);
    mutacion.mutate(totalEsperado);
  };
  return { confirmar, panel, enviando: mutacion.isPending, exito: mutacion.isSuccess ? mutacion.data : null, reiniciar: () => mutacion.reset() };
}
