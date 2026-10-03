import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buscarHuespedPorDocumento } from "./checkIn.api";
import { DEMORA_BUSQUEDA_DOCUMENTO_MS, LARGO_MINIMO_DOCUMENTO } from "./checkInPantalla.constantes";

export function useDebounce(valor, demora) {
  const [actual, setActual] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setActual(valor), demora);
    return () => clearTimeout(t);
  }, [valor, demora]);
  return actual;
}

// Persona que vuelve: con tipo, país y número completos (400 ms sin tipear), busca la ficha por
// coincidencia EXACTA. 200 -> completa la fila una sola vez por documento. 404 o error de red:
// nada. Nunca se consulta un número parcial.
export function usePersonaQueVuelve(fila, dispatch, habilitada = true) {
  const { tipoDocumento: tipo, paisDocumento: pais, numeroDocumento } = fila.campos;
  const numero = String(numeroDocumento ?? "").trim().toUpperCase().replace(/\s/g, "");
  const clave = useDebounce(tipo && pais && numero.length >= LARGO_MINIMO_DOCUMENTO ? `${tipo}|${pais}|${numero}` : "", DEMORA_BUSQUEDA_DOCUMENTO_MS);
  const aplicada = useRef(null);
  const consulta = useQuery({
    queryKey: ["huespedes", "por-documento", clave],
    queryFn: () => {
      const [t, p, n] = clave.split("|");
      return buscarHuespedPorDocumento({ tipo: t, pais: p, numero: n });
    },
    enabled: habilitada && Boolean(clave),
    retry: false,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (consulta.isSuccess && consulta.data && aplicada.current !== clave) {
      aplicada.current = clave;
      dispatch({ tipo: "completarDesdeFicha", filaId: fila.id, ficha: consulta.data });
    }
  }, [consulta.isSuccess, consulta.data, clave, dispatch, fila.id]);
}
