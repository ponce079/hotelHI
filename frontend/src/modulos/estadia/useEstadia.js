import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useSesion } from "../../lib/sesion";
import { titularRegistrado } from "./titularRegistrado";
import { CODIGO_PERSONA_ADICIONAL } from "./estadiaUtils";
import {
  reintentarLecturaEstadia as reintentarLectura,
  reintentarTitular,
  demoraReintentoTitular,
} from "./recuperacionEstadia";

// Claves que hay que refrescar después de cualquier cambio en la estadía.
const CLAVES_A_REFRESCAR = [
  "ocupantes",
  "estadia-historial",
  "reserva-historial",
  "check-out",
  "consumos-servicios",
  "pagos-estadia",
  "reservas",
  "alojados",
];

// Lógica de las personas de una reserva (ocupantes), compartida por la pestaña Huéspedes y por los
// modales (ficha, mover, persona adicional, salida, anular cargo). Es la que antes vivía dentro de
// EstadiaPanel: incorpora al titular de la reserva cuando falta, lee los ocupantes con reintentos
// y concentra las mutaciones. No dibuja nada.
export function useEstadia(reserva, { onTitularPreparado } = {}) {
  const [erroresServidor, setErroresServidor] = useState({});
  const { usuario, puede } = useSesion();
  const qc = useQueryClient();
  const [editor, setEditor] = useState(null);
  const [anular, setAnular] = useState(null);
  const [moviendo, setMoviendo] = useState(null);
  const [adicional, setAdicional] = useState(null);
  const [saliendo, setSaliendo] = useState(null);
  const [verFicha, setVerFicha] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const puedeEditar =
    (puede("gestionarReservas") || puede("gestionarCheckIn")) && ["Confirmada", "En curso"].includes(reserva.estado);
  const puedeCargos = puede("registrarConsumoServicio") && reserva.estado === "En curso";
  const intentoTitular = useRef(null);
  const necesitaTitular = puedeEditar && Boolean(reserva.huesped);
  const personas = useQuery({
    queryKey: ["ocupantes", reserva.id],
    queryFn: () => api.get(`/estadia/${reserva.id}/ocupantes`).then((r) => r.data),
    retry: reintentarLectura,
  });
  const titular = useMutation({
    mutationFn: () => api.post(`/estadia/${reserva.id}/titular`, { operador: usuario }).then((r) => r.data),
    retry: reintentarTitular,
    retryDelay: demoraReintentoTitular,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ocupantes", reserva.id] });
      qc.invalidateQueries({ queryKey: ["estadia-historial", reserva.id] });
      qc.invalidateQueries({ queryKey: ["reserva-historial", reserva.id] });
      onTitularPreparado?.(reserva.id);
    },
  });
  const titularExistente = titularRegistrado(personas.data || [], reserva.huesped, titular.data?.ocupanteId);
  const titularDeLaReservaActivo =
    titularExistente && titularExistente.estado !== "Cancelado" ? titularExistente : null;
  useEffect(() => {
    if (
      necesitaTitular &&
      personas.isSuccess &&
      !personas.isFetching &&
      !titularExistente &&
      intentoTitular.current !== reserva.id
    ) {
      intentoTitular.current = reserva.id;
      titular.mutate();
    }
  }, [necesitaTitular, reserva.id, titular.mutate, personas.isSuccess, personas.isFetching, titularExistente]);
  useEffect(() => {
    if (necesitaTitular && personas.isSuccess && titularExistente) onTitularPreparado?.(reserva.id);
  }, [necesitaTitular, personas.isSuccess, titularExistente?.id, reserva.id, onTitularPreparado]);
  const preparandoTitular = necesitaTitular && !titularExistente && !titular.isSuccess;
  const refrescar = () => {
    for (const k of CLAVES_A_REFRESCAR) qc.invalidateQueries({ queryKey: [k] });
  };
  const mutation = useMutation({
    mutationFn: async ({ tipo, data }) => {
      setError("");
      setErroresServidor({});
      if (tipo === "guardar")
        return editor.id
          ? api.put(`/estadia/${reserva.id}/ocupantes/${editor.id}`, {
              ...data,
              operador: usuario,
            })
          : api.post(`/estadia/${reserva.id}/ocupantes`, {
              ...data,
              operador: usuario,
            });
      if (tipo === "anular")
        return api.post(`/consumos-servicios/${anular.id}/anular`, {
          motivo,
          operador: usuario,
        });
      return api.post(`/estadia/${reserva.id}/ocupantes/${data.id}/accion`, {
        accion: tipo,
        operador: usuario,
        ...(data.confirmacionPersonaAdicional
          ? { confirmacionPersonaAdicional: data.confirmacionPersonaAdicional }
          : {}),
      });
    },
    onSuccess: () => {
      setEditor(null);
      setAdicional(null);
      setSaliendo(null);
      setAnular(null);
      setMotivo("");
      refrescar();
    },
    onError: (e, variables) => {
      // Persona adicional: no es un error, es la vista previa que hay que confirmar.
      if (e.response?.data?.codigo === CODIGO_PERSONA_ADICIONAL) {
        setAdicional({ vista: e.response.data.detalle, variables });
        return;
      }
      setError(e.response?.data?.error || "No se pudo guardar el cambio.");
      setErroresServidor(
        Object.fromEntries(
          Object.entries(e.response?.data?.campos || {}).map(([k, mensaje]) => [
            k,
            { mensaje, valor: variables?.data?.[k] },
          ]),
        ),
      );
    },
  });
  // Las fichas canceladas (por ejemplo, reemplazadas en el check-in) no se listan ni generan
  // faltantes: quedan en el Historial con su motivo.
  const todas = personas.data || [];
  const listado = todas.filter((p) => p.estado !== "Cancelado");
  const errorCargaPersonas =
    preparandoTitular && titular.isError ? titular.error : personas.isError ? personas.error : null;
  const cargandoPersonas = personas.isFetching || (preparandoTitular && titular.isPending);
  function recuperarPersonas() {
    if (cargandoPersonas) return;
    // Si el POST perdió la respuesta, se recupera el mismo titular; nunca
    // se envía el formulario de alta de otro ocupante durante este reintento.
    if (personas.isError || !personas.isSuccess) personas.refetch();
    else if (preparandoTitular) titular.mutate();
    else personas.refetch();
  }
  function abrirEditor(persona) {
    setError("");
    setErroresServidor({});
    setEditor(persona);
  }
  return {
    reserva,
    personas,
    titular,
    todas,
    listado,
    titularExistente,
    titularDeLaReservaActivo,
    preparandoTitular,
    cargandoPersonas,
    errorCargaPersonas,
    recuperarPersonas,
    puedeEditar,
    puedeCargos,
    mutation,
    error,
    setError,
    erroresServidor,
    editor,
    setEditor,
    abrirEditor,
    moviendo,
    setMoviendo,
    adicional,
    setAdicional,
    saliendo,
    setSaliendo,
    verFicha,
    setVerFicha,
    anular,
    setAnular,
    motivo,
    setMotivo,
    refrescar,
  };
}
