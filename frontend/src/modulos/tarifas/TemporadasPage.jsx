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
import { hoyEnHoraLocal } from "../../lib/fechas";
import { TarifasTabs } from "./TarifasTabs";
import { TemporadaModal } from "./TemporadaModal";
import { listarTemporadas, cambiarActivaTemporada } from "./tarifas.api";
import { NIVEL_TEMPORADA_LABEL } from "./tarifas.constantes";

export function TemporadasPage() {
  const { puede, usuario } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null); // null | { tipo: "crear" } | { tipo: "editar", registro }
  const [cambioActiva, setCambioActiva] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState("");

  if (!puede("verTarifas")) return <SinPermiso />;
  const puedeGestionar = puede("gestionarTarifas");
  const hoy = hoyEnHoraLocal();

  const { data: temporadas, isLoading, isError } = useQuery({
    queryKey: ["tarifas", "temporadas", "todos"],
    queryFn: () => listarTemporadas({ activo: "todos" }),
  });

  const mutacionActiva = useMutation({
    mutationFn: ({ id, activa }) => cambiarActivaTemporada(id, activa, activa ? undefined : motivoBaja, usuario),
    onSuccess: (actualizada) => {
      queryClient.invalidateQueries({ queryKey: ["tarifas", "temporadas"] });
      mostrarToast(`Temporada "${actualizada.nombre}" ${actualizada.activa ? "reactivada" : "dada de baja"}.`);
      setCambioActiva(null);
      setMotivoBaja("");
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar la vigencia de la temporada.");
    },
  });

  function cerrarConExito(mensaje) {
    setModal(null);
    mostrarToast(mensaje);
  }

  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas/temporadas" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Temporadas</h1>
          <p className="text-sm text-piedra">Rangos de fecha con su nivel de demanda (HU-90).</p>
        </div>
        {puedeGestionar && (
          <Button icono={Plus} onClick={() => setModal({ tipo: "crear" })}>
            Nueva temporada
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar las temporadas.</p>
        ) : (
          <Table
            columnas={["Nombre", "Nivel", "Desde", "Hasta", "Estadía mín.", "Cierre llegada", "Estado", puedeGestionar ? "Acciones" : null].filter(Boolean)}
            columnasDerecha={puedeGestionar ? ["Acciones"] : []}
            filas={temporadas}
            vacio="Todavía no hay temporadas cargadas."
            renderFila={(t) => {
              const soloLectura = t.fechaHasta && String(t.fechaHasta).slice(0, 10) < hoy;
              return (
                <tr key={t.id} className="border-b border-borde last:border-0">
                  <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{t.nombre}</td>
                  <td className="px-3 py-2 text-[12.5px]">{NIVEL_TEMPORADA_LABEL[t.nivel] ?? t.nivel}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{t.fechaDesde ? String(t.fechaDesde).slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{t.fechaHasta ? String(t.fechaHasta).slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2 text-[12.5px]">{t.estadiaMinima ? `${t.estadiaMinima} noches` : "—"}</td>
                  <td className="px-3 py-2 text-[12.5px]">{t.cierreLlegada ? "Sí" : "No"}</td>
                  <td className="px-3 py-2">
                    <Badge variante={t.activa ? "ok" : "neutro"}>{t.activa ? "Activa" : "Dada de baja"}</Badge>
                    {soloLectura && (
                      <span className="ml-1.5 text-[11px] text-piedra">(terminada)</span>
                    )}
                  </td>
                  {puedeGestionar && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variante="secundario"
                          tamano="fila"
                          onClick={() => setModal({ tipo: "editar", registro: t })}
                          icono={Pencil}
                          disabled={soloLectura}
                        >
                          Editar
                        </Button>
                        {t.nivel !== "BASE" && (
                          <Button
                            variante={t.activa ? "destructivo" : undefined}
                            tamano="fila"
                            onClick={() => setCambioActiva(t)}
                            icono={t.activa ? Trash2 : RotateCw}
                          >
                            {t.activa ? "Dar de baja" : "Reactivar"}
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            }}
          />
        )}
      </div>

      {(modal?.tipo === "crear" || modal?.tipo === "editar") && (
        <TemporadaModal temporada={modal.tipo === "editar" ? modal.registro : null} onClose={() => setModal(null)} onExito={cerrarConExito} />
      )}

      <ConfirmDialog
        abierto={Boolean(cambioActiva)}
        titulo={cambioActiva?.activa ? "¿Dar de baja la temporada?" : "¿Reactivar la temporada?"}
        mensaje={
          cambioActiva?.activa
            ? `"${cambioActiva?.nombre}" deja de contar para resolverTemporadaEfectiva.`
            : `"${cambioActiva?.nombre}" vuelve a estar activa (se revalida que no se solape con otra del mismo nivel).`
        }
        textoConfirmar={cambioActiva?.activa ? "Sí, dar de baja" : "Sí, reactivar"}
        variante={cambioActiva?.activa ? "destructivo" : "alta"}
        icono={cambioActiva?.activa ? Trash2 : RotateCw}
        onCancelar={() => {
          setCambioActiva(null);
          setMotivoBaja("");
        }}
        onConfirmar={() => mutacionActiva.mutate({ id: cambioActiva.id, activa: !cambioActiva.activa })}
      >
        {cambioActiva?.activa && (
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
