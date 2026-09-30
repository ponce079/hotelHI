import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Plus } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { formatearMonto } from "../../lib/moneda";
import { TarifasTabs } from "./TarifasTabs";
import { ActualizacionMasivaWizard } from "./ActualizacionMasivaWizard";
import { listarLotesActualizacion, anularLote } from "./tarifas.api";
import { ESTADO_LOTE } from "./tarifas.constantes";

export function ActualizacionesPage() {
  const { puede, usuario } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [wizardAbierto, setWizardAbierto] = useState(false);
  const [loteAAnular, setLoteAAnular] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  if (!puede("verTarifas")) return <SinPermiso />;
  const puedeGestionar = puede("gestionarTarifas");

  const { data: lotes, isLoading, isError } = useQuery({
    queryKey: ["tarifas", "lotes"],
    queryFn: listarLotesActualizacion,
  });

  const mutacionAnular = useMutation({
    mutationFn: () => anularLote(loteAAnular.id, motivoAnulacion, usuario),
    onSuccess: (actualizado) => {
      queryClient.invalidateQueries({ queryKey: ["tarifas", "lotes"] });
      queryClient.invalidateQueries({ queryKey: ["tarifas", "precios"] });
      mostrarToast(`Lote ${actualizado.numero} anulado.`);
      setLoteAAnular(null);
      setMotivoAnulacion("");
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo anular el lote."),
  });

  function cerrarWizardConExito(mensaje) {
    setWizardAbierto(false);
    mostrarToast(mensaje);
  }

  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas/actualizaciones" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Actualizaciones masivas</h1>
          <p className="text-sm text-piedra">Lotes de aumento/descuento por porcentaje sobre la tarifa vigente (HU-93).</p>
        </div>
        {puedeGestionar && (
          <Button icono={Plus} onClick={() => setWizardAbierto(true)}>
            Nueva actualización masiva
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar los lotes de actualización.</p>
        ) : (
          <Table
            columnas={["Número", "Porcentaje", "Vigente desde", "Celdas", "Motivo", "Estado", puedeGestionar ? "Acciones" : null].filter(Boolean)}
            columnasDerecha={puedeGestionar ? ["Acciones"] : []}
            filas={lotes}
            vacio="Todavía no se cargó ninguna actualización masiva."
            renderFila={(l) => (
              <tr key={l.id} className="border-b border-borde last:border-0">
                <td className="px-3 py-2 font-mono text-[12.5px] font-semibold">{l.numero}</td>
                <td className="px-3 py-2 font-mono text-[12.5px]">{Number(l.porcentaje) > 0 ? "+" : ""}{Number(l.porcentaje)}%</td>
                <td className="px-3 py-2 font-mono text-[12px]">{String(l.vigenteDesde).slice(0, 10)}</td>
                <td className="px-3 py-2 text-[12.5px]">{l.tarifas?.length ?? 0}</td>
                <td className="px-3 py-2 text-[12.5px] text-tinta/60">{l.motivo}</td>
                <td className="px-3 py-2">
                  <Badge variante={l.estado === ESTADO_LOTE.APLICADO ? "ok" : "neutro"}>{l.estado}</Badge>
                </td>
                {puedeGestionar && (
                  <td className="px-3 py-2 text-right">
                    {l.estado === ESTADO_LOTE.APLICADO && (
                      <Button variante="destructivo" tamano="fila" icono={Ban} onClick={() => setLoteAAnular(l)}>
                        Anular
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            )}
          />
        )}
      </div>

      {wizardAbierto && <ActualizacionMasivaWizard onClose={() => setWizardAbierto(false)} onExito={cerrarWizardConExito} />}

      <ConfirmDialog
        abierto={Boolean(loteAAnular)}
        titulo="¿Anular el lote?"
        mensaje={`El lote ${loteAAnular?.numero} se anula y se borran las ${loteAAnular?.tarifas?.length ?? 0} versión(es) de tarifa que creó. Solo se puede anular antes de que llegue su vigencia.`}
        textoConfirmar="Sí, anular"
        variante="destructivo"
        icono={Ban}
        cargando={mutacionAnular.isPending}
        onCancelar={() => {
          setLoteAAnular(null);
          setMotivoAnulacion("");
        }}
        onConfirmar={() => mutacionAnular.mutate()}
      >
        <textarea
          rows={2}
          value={motivoAnulacion}
          onChange={(e) => setMotivoAnulacion(e.target.value)}
          placeholder="Motivo de la anulación (obligatorio)…"
          className="w-full rounded-md border border-borde px-3 py-2 text-[13px]"
        />
      </ConfirmDialog>

      <Toast mensaje={toast} />
    </div>
  );
}
