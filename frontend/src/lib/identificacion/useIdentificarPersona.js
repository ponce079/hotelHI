import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buscarHuespedPorDocumento } from "../../modulos/check-in/checkIn.api";
import { DEMORA_BUSQUEDA_DOCUMENTO_MS, LARGO_MINIMO_DOCUMENTO, fichaDesdeRespuesta, normalizarNumeroDocumento } from "./ficha";

export function useDebounce(valor, demora) {
  const [actual, setActual] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setActual(valor), demora);
    return () => clearTimeout(t);
  }, [valor, demora]);
  return actual;
}

// Hook ÚNICO de identificación por documento (reemplaza a usePersonaQueVuelve y useTitularPorDocumento). Con tipo, país
// emisor y número completos busca por coincidencia EXACTA: 400 ms después de tipear, o al instante con `buscarAhora()`
// (botón "Buscar"). Nunca consulta un número parcial. Estados:
//   "inactivo"   — faltan datos o la búsqueda está deshabilitada;
//   "buscando"   — consulta en curso;
//   "registrada" — existe: viene `ficha` con TODOS sus datos;
//   "nueva"      — no existe (404): el formulario sigue vacío; `otrosDocumentos` avisa si el mismo número está registrado
//                  con otro tipo o país de documento;
//   "error"      — la consulta falló (sin sesión, red): no se bloquea nada.
export function useIdentificarPersona({ tipoDocumento, paisDocumento, numeroDocumento, habilitada = true }) {
  const numero = normalizarNumeroDocumento(numeroDocumento);
  const completo = Boolean(habilitada && tipoDocumento && paisDocumento && numero.length >= LARGO_MINIMO_DOCUMENTO);
  const claveActual = completo ? `${tipoDocumento}|${paisDocumento}|${numero}` : "";
  const claveConDemora = useDebounce(claveActual, DEMORA_BUSQUEDA_DOCUMENTO_MS);
  // El botón "Buscar" salta la demora para la clave que hay ahora.
  const [forzada, setForzada] = useState("");
  const clave = claveActual && (claveConDemora === claveActual || forzada === claveActual) ? claveActual : "";
  const consulta = useQuery({
    queryKey: ["huespedes", "por-documento", clave],
    queryFn: () => {
      const [tipo, pais, n] = clave.split("|");
      return buscarHuespedPorDocumento({ tipo, pais, numero: n });
    },
    enabled: Boolean(clave),
    retry: false,
    staleTime: 60_000,
  });
  const refetch = useRef(consulta.refetch);
  refetch.current = consulta.refetch;
  const buscarAhora = () => {
    if (!claveActual) return;
    if (forzada === claveActual) refetch.current();
    else setForzada(claveActual);
  };

  const base = { buscarAhora, puedeBuscar: completo };
  if (!completo) return { estado: "inactivo", clave: "", ficha: null, otrosDocumentos: [], ...base };
  if (!clave || consulta.isPending || consulta.isFetching) return { estado: "buscando", clave: claveActual, ficha: null, otrosDocumentos: [], ...base };
  if (consulta.isSuccess && consulta.data) {
    return { estado: "registrada", clave, ficha: fichaDesdeRespuesta(consulta.data), otrosDocumentos: [], ...base };
  }
  if (consulta.error?.response?.status === 404) {
    return { estado: "nueva", clave, ficha: null, otrosDocumentos: consulta.error.response.data?.otrosDocumentos ?? [], ...base };
  }
  return { estado: "error", clave, ficha: null, otrosDocumentos: [], ...base };
}
