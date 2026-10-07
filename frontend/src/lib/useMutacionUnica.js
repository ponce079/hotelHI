import { useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";

// Igual que useMutation, pero con un bloqueo SINCRÓNICO contra el doble clic: mientras hay un envío en curso,
// cualquier otro `mutate` / `mutateAsync` se descarta en el acto (no espera a que React vuelva a dibujar el botón
// deshabilitado). Se libera cuando la mutación termina, bien o mal. Las escrituras no se reintentan solas.
export function useMutacionUnica(opciones) {
  const enCurso = useRef(false);
  const mutacion = useMutation({
    retry: 0,
    ...opciones,
    onSettled: (...argumentos) => {
      enCurso.current = false;
      return opciones?.onSettled?.(...argumentos);
    },
  });
  const { mutate, mutateAsync } = mutacion;
  const mutar = useCallback(
    (variables, o) => {
      if (enCurso.current) return;
      enCurso.current = true;
      mutate(variables, o);
    },
    [mutate],
  );
  const mutarAsync = useCallback(
    (variables, o) => {
      if (enCurso.current) return Promise.resolve(undefined);
      enCurso.current = true;
      return mutateAsync(variables, o);
    },
    [mutateAsync],
  );
  return { ...mutacion, mutate: mutar, mutateAsync: mutarAsync };
}
