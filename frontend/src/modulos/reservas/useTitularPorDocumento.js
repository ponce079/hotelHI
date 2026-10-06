import { useQuery } from "@tanstack/react-query";
import { buscarHuespedPorDocumento } from "../check-in/checkIn.api";
import { useDebounce } from "../check-in/usePersonaQueVuelve";
import { DEMORA_BUSQUEDA_DOCUMENTO_MS, LARGO_MINIMO_DOCUMENTO } from "../check-in/checkInPantalla.constantes";

// Mismo criterio que el backend (lib/documento.js): sin puntos, guiones ni espacios.
export function normalizarNumeroDocumento(valor) {
  return String(valor ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Busca al huésped por su documento (coincidencia exacta, tipo + país + número completos, 400 ms
// después de tipear) para autocompletar su nombre. Estados:
//   "inactivo"  — faltan datos o la búsqueda está deshabilitada;
//   "buscando"  — consulta en curso;
//   "registrado"— existe: viene `nombres` y `apellido` tal como están guardados;
//   "nuevo"     — no existe (404): el recepcionista carga el nombre;
//   "error"     — la consulta falló (sin sesión, red): no se bloquea nada, el backend igual protege el nombre.
export function useTitularPorDocumento({ tipoDocumento, paisDocumento, numeroDocumento, habilitada = true }) {
  const numero = normalizarNumeroDocumento(numeroDocumento);
  const completo = Boolean(tipoDocumento && paisDocumento && numero.length >= LARGO_MINIMO_DOCUMENTO);
  const clave = useDebounce(completo ? `${tipoDocumento}|${paisDocumento}|${numero}` : "", DEMORA_BUSQUEDA_DOCUMENTO_MS);
  const consulta = useQuery({
    queryKey: ["huespedes", "por-documento", "reserva", clave],
    queryFn: () => {
      const [tipo, pais, n] = clave.split("|");
      return buscarHuespedPorDocumento({ tipo, pais, numero: n });
    },
    enabled: habilitada && Boolean(clave),
    retry: false,
    staleTime: 60_000,
  });
  if (!habilitada || !completo || !clave) return { estado: "inactivo", clave: "" };
  if (consulta.isPending || consulta.isFetching) return { estado: "buscando", clave };
  if (consulta.isSuccess && consulta.data) {
    const { nombreRegistrado, fechaNacimiento } = consulta.data;
    return {
      estado: "registrado",
      clave,
      nombres: nombreRegistrado?.nombres ?? consulta.data.nombre,
      apellido: nombreRegistrado?.apellido ?? "",
      fechaNacimiento: fechaNacimiento ?? "",
    };
  }
  if (consulta.error?.response?.status === 404) return { estado: "nuevo", clave };
  return { estado: "error", clave };
}
