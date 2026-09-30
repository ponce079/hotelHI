import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Button } from "../../componentes/Button";
import { listarModificadores, actualizarModificador } from "./tarifas.api";
import { DIA_SEMANA_LABEL, RANGO_MODIFICADOR_DIA } from "./tarifas.constantes";

// Las 7 filas globales del modificador por día de semana (HU-92) — se
// guarda cada fila por separado (no hay un "guardar todo"), la grilla de
// precios sigue mostrando el precio base sin este modificador: todavía no
// se aplica en ningún cálculo, es una carga a futuro para la Etapa 3.
export function ModificadorDiaSemanaModal({ onClose, onExito }) {
  const queryClient = useQueryClient();
  const [valores, setValores] = useState({});
  const [errores, setErrores] = useState({});

  const { data: modificadores, isLoading } = useQuery({
    queryKey: ["tarifas", "modificadores"],
    queryFn: listarModificadores,
  });

  useEffect(() => {
    if (!modificadores) return;
    setValores(Object.fromEntries(modificadores.map((m) => [m.diaSemana, String(m.porcentaje)])));
  }, [modificadores]);

  const mutacion = useMutation({
    mutationFn: ({ diaSemana, porcentaje }) => actualizarModificador(diaSemana, porcentaje),
    onSuccess: (_actualizado, { diaSemana }) => {
      queryClient.invalidateQueries({ queryKey: ["tarifas", "modificadores"] });
      setErrores((e) => ({ ...e, [diaSemana]: undefined }));
      onExito(`Modificador de ${DIA_SEMANA_LABEL[diaSemana]} guardado.`);
    },
    onError: (error, { diaSemana }) => {
      setErrores((e) => ({ ...e, [diaSemana]: error?.response?.data?.error ?? "No se pudo guardar." }));
    },
  });

  function guardar(diaSemana) {
    const porcentaje = Number(valores[diaSemana]);
    if (!Number.isFinite(porcentaje) || porcentaje < RANGO_MODIFICADOR_DIA.min || porcentaje > RANGO_MODIFICADOR_DIA.max) {
      setErrores((e) => ({ ...e, [diaSemana]: `Tiene que estar entre ${RANGO_MODIFICADOR_DIA.min} y ${RANGO_MODIFICADOR_DIA.max}.` }));
      return;
    }
    mutacion.mutate({ diaSemana, porcentaje });
  }

  return (
    <Modal titulo="Modificadores por día de semana" subtitulo="Porcentaje global, todavía no se aplica al cálculo de precios" onClose={onClose} ancho="max-w-lg">
      <div className="flex flex-col gap-3 px-6 py-5">
        {isLoading ? (
          <p className="text-sm text-piedra">Cargando…</p>
        ) : (
          (modificadores ?? []).map((m) => (
            <div key={m.diaSemana} className="flex items-center gap-3">
              <span className="w-24 text-[13px] font-semibold">{DIA_SEMANA_LABEL[m.diaSemana]}</span>
              <input
                type="number"
                step="0.5"
                min={RANGO_MODIFICADOR_DIA.min}
                max={RANGO_MODIFICADOR_DIA.max}
                value={valores[m.diaSemana] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [m.diaSemana]: e.target.value }))}
                className="w-24 rounded-md border border-borde px-2.5 py-1.5 text-[13px]"
              />
              <span className="text-[12px] text-piedra">%</span>
              <Button
                variante="secundario"
                tamano="fila"
                icono={Save}
                onClick={() => guardar(m.diaSemana)}
                cargando={mutacion.isPending && mutacion.variables?.diaSemana === m.diaSemana}
              >
                Guardar
              </Button>
              {errores[m.diaSemana] && <span className="text-[11px] text-error-texto">{errores[m.diaSemana]}</span>}
            </div>
          ))
        )}
      </div>
      <div className="flex justify-end border-t border-borde px-6 py-4">
        <Button variante="secundario" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
