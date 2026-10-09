import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, RotateCw, Trash2 } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { Table } from "../../componentes/Table";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { TarifasTabs } from "./TarifasTabs";
import { PlanTarifarioModal } from "./PlanTarifarioModal";
import { listarPlanesTarifarios, cambiarActivoPlanTarifario } from "./tarifas.api";
import { PENALIDAD_NO_SHOW_LABEL } from "./tarifas.constantes";

export function PlanesPage() {
  const { puede, usuario } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [cambioActivo, setCambioActivo] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState("");

  const puedeGestionar = puede("gestionarTarifas");

  const { data: planes, isLoading, isError } = useQuery({
    enabled: puede("verTarifas"),
    queryKey: ["tarifas", "planes", "todos"],
    queryFn: () => listarPlanesTarifarios({ activo: "todos" }),
  });
  const planPorId = new Map((planes ?? []).map((p) => [p.id, p]));

  const mutacionActivo = useMutation({
    mutationFn: ({ id, activo }) => cambiarActivoPlanTarifario(id, activo, activo ? undefined : motivoBaja, usuario),
    onSuccess: (actualizado) => {
      queryClient.invalidateQueries({ queryKey: ["tarifas", "planes"] });
      mostrarToast(`Plan "${actualizado.nombre}" ${actualizado.activo ? "reactivado" : "dado de baja"}.`);
      setCambioActivo(null);
      setMotivoBaja("");
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar la vigencia del plan."),
  });

  function cerrarConExito(mensaje) {
    setModal(null);
    mostrarToast(mensaje);
  }

  if (!puede("verTarifas")) return <SinPermiso />;
  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas/planes" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Planes tarifarios</h1>
          <p className="text-sm text-piedra">Condiciones de venta — BAR (base) y derivados.</p>
        </div>
        {puedeGestionar && (
          <Button icono={Plus} onClick={() => setModal({ tipo: "crear" })}>
            Nuevo plan
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar los planes tarifarios.</p>
        ) : (
          <Table
            columnas={["Código", "Nombre", "Tipo", "Reembolsable", "No-show", "Web", "Estado", puedeGestionar ? "Acciones" : null].filter(Boolean)}
            columnasDerecha={puedeGestionar ? ["Acciones"] : []}
            filas={planes}
            vacio="Todavía no hay planes tarifarios cargados."
            renderFila={(p) => (
              <tr key={p.id} className="border-b border-borde last:border-0">
                <td className="px-3 py-2 font-mono text-[12.5px]">{p.codigo}</td>
                <td className="px-3 py-2 font-body text-[13.5px] font-semibold">
                  {p.nombre}
                  {p.tipo === "DERIVADO" && p.planBaseId && (
                    <span className="ml-1.5 text-[11px] text-piedra">
                      (-{Number(p.descuentoPorcentaje)}% sobre {planPorId.get(p.planBaseId)?.nombre ?? "—"})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variante={p.tipo === "BASE" ? "info" : "neutro"}>{p.tipo === "BASE" ? "Base" : "Derivado"}</Badge>
                </td>
                <td className="px-3 py-2 text-[12.5px]">
                  {p.reembolsable ? `Sí — ${p.horasCancelacionSinCargo}h sin cargo` : "No"}
                </td>
                <td className="px-3 py-2 text-[12.5px]">{PENALIDAD_NO_SHOW_LABEL[p.penalidadNoShow] ?? p.penalidadNoShow}</td>
                <td className="px-3 py-2 text-[12.5px]">{p.visibleWeb ? "Sí" : "No"}</td>
                <td className="px-3 py-2">
                  <Badge variante={p.activo ? "ok" : "neutro"}>{p.activo ? "Activo" : "Dado de baja"}</Badge>
                </td>
                {puedeGestionar && (
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variante="secundario" tamano="fila" onClick={() => setModal({ tipo: "editar", registro: p })} icono={Pencil}>
                        Editar
                      </Button>
                      {p.tipo !== "BASE" && (
                        <Button
                          variante={p.activo ? "destructivo" : undefined}
                          tamano="fila"
                          onClick={() => setCambioActivo(p)}
                          icono={p.activo ? Trash2 : RotateCw}
                        >
                          {p.activo ? "Dar de baja" : "Reactivar"}
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )}
          />
        )}
      </div>

      {(modal?.tipo === "crear" || modal?.tipo === "editar") && (
        <PlanTarifarioModal plan={modal.tipo === "editar" ? modal.registro : null} onClose={() => setModal(null)} onExito={cerrarConExito} />
      )}

      <ConfirmDialog
        abierto={Boolean(cambioActivo)}
        titulo={cambioActivo?.activo ? "¿Dar de baja el plan?" : "¿Reactivar el plan?"}
        mensaje={
          cambioActivo?.activo
            ? `"${cambioActivo?.nombre}" deja de ofrecerse.`
            : `"${cambioActivo?.nombre}" vuelve a estar disponible.`
        }
        textoConfirmar={cambioActivo?.activo ? "Sí, dar de baja" : "Sí, reactivar"}
        variante={cambioActivo?.activo ? "destructivo" : "alta"}
        icono={cambioActivo?.activo ? Trash2 : RotateCw}
        onCancelar={() => {
          setCambioActivo(null);
          setMotivoBaja("");
        }}
        onConfirmar={() => mutacionActivo.mutate({ id: cambioActivo.id, activo: !cambioActivo.activo })}
      >
        {cambioActivo?.activo && (
          <textarea
            rows={2}
            value={motivoBaja}
            onChange={(e) => setMotivoBaja(e.target.value)}
            placeholder="Motivo de la baja (obligatorio)…"
            className="w-full rounded-md border border-borde px-3 py-2 text-[13px]"
          />
        )}
      </ConfirmDialog>

      <Toast mensaje={toast} />
    </div>
  );
}
