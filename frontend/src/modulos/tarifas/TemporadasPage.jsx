import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, RotateCw, Trash2 } from "lucide-react";
import { Button } from "../../componentes/Button";
import { ChipNivel } from "../../componentes/ChipNivel";
import { MenuAcciones } from "../../componentes/MenuAcciones";
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
import { listarTemporadas, cambiarActivaTemporada, obtenerCalendario } from "./tarifas.api";
import { esTemporadaPasada, prepararFilasTemporadas, textoDiasTemporada, textoRangoTemporada, textoRestriccionesTemporada } from "./tarifas.matriz";

function InterruptorLista({ etiqueta, marcado, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-tinta">
      <input
        type="checkbox"
        role="switch"
        checked={marcado}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
      />
      {etiqueta}
    </label>
  );
}

export function TemporadasPage() {
  const { puede, usuario } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null); // null | { tipo: "crear" } | { tipo: "editar", registro }
  const [cambioActiva, setCambioActiva] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [mostrarPasadas, setMostrarPasadas] = useState(false);
  const [mostrarBajas, setMostrarBajas] = useState(false);

  const puedeGestionar = puede("gestionarTarifas");
  const hoy = hoyEnHoraLocal();

  const { data: temporadas, isLoading, isError } = useQuery({
    enabled: puede("verTarifas"),
    queryKey: ["tarifas", "temporadas", "todos"],
    queryFn: () => listarTemporadas({ activo: "todos" }),
  });

  // Temporada que aplica hoy: la resuelve el backend (misma fuente que la matriz de Tarifas).
  const { data: diaHoy } = useQuery({
    enabled: puede("verTarifas"),
    queryKey: ["tarifas", "calendario", "hoy", hoy],
    queryFn: () => obtenerCalendario(hoy, hoy),
  });
  const temporadaHoyId = diaHoy?.[0]?.temporadaId ?? null;

  const todas = temporadas ?? [];
  const filas = prepararFilasTemporadas(todas, hoy, { mostrarPasadas, mostrarBajas });
  const hayPasadas = todas.some((t) => esTemporadaPasada(t, hoy) && (mostrarBajas || t.activa !== false));
  const hayBajas = todas.some((t) => t.activa === false && (mostrarPasadas || !esTemporadaPasada(t, hoy)));

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

  if (!puede("verTarifas")) return <SinPermiso />;
  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas/temporadas" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Temporadas</h1>
          <p className="text-sm text-piedra">Rangos de fecha con su nivel de demanda.</p>
        </div>
        {puedeGestionar && (
          <Button icono={Plus} onClick={() => setModal({ tipo: "crear" })}>
            Nueva temporada
          </Button>
        )}
      </div>

      <div className="min-w-0 rounded-lg border border-borde bg-white">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar las temporadas.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--divisor-fila)] px-4 py-2.5">
              <p className="text-[12.5px] text-[var(--text-3)]">
                {filas.length} {filas.length === 1 ? "temporada" : "temporadas"}
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {hayPasadas && (
                  <InterruptorLista etiqueta="Mostrar temporadas pasadas" marcado={mostrarPasadas} onChange={setMostrarPasadas} />
                )}
                {hayBajas && <InterruptorLista etiqueta="Mostrar dadas de baja" marcado={mostrarBajas} onChange={setMostrarBajas} />}
              </div>
            </div>
            <Table
              columnas={["Temporada", "Nivel", "Fechas", "Restricciones", puedeGestionar ? "Acciones" : null].filter(Boolean)}
              columnasDerecha={puedeGestionar ? ["Acciones"] : []}
              filas={filas}
              vacio="Todavía no hay temporadas cargadas."
              claseFila={({ temporada, pasada, baja }) =>
                pasada || baja ? "tabla-sgh-fila-atenuada" : temporada.id === temporadaHoyId ? "bg-[var(--fila-hoy-bg)]" : ""
              }
              renderFila={({ temporada: t, pasada, baja }) => {
                const esHoy = t.id === temporadaHoyId && !baja;
                const dias = textoDiasTemporada(t);
                const restricciones = textoRestriccionesTemporada(t);
                const acciones =
                  t.nivel === "BASE"
                    ? []
                    : [
                        t.activa
                          ? { label: "Dar de baja", variante: "destructivo", onClick: () => setCambioActiva(t) }
                          : { label: "Reactivar", onClick: () => setCambioActiva(t) },
                      ];
                return (
                  <tr key={t.id} className="border-b border-[var(--divisor-fila)] last:border-0">
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-tinta">{t.nombre}</span>
                        {esHoy && (
                          <span className="rounded-full bg-[var(--primary)] px-2 py-px text-[11px] font-semibold text-[var(--on-color)]">HOY</span>
                        )}
                        {baja && <Badge variante="neutro">Dada de baja</Badge>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChipNivel nivel={t.nivel} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block text-[13px] text-tinta">{textoRangoTemporada(t, hoy)}</span>
                      {dias && <span className="block text-[12px] text-[var(--text-3)]">{dias}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-tinta">{restricciones}</td>
                    {puedeGestionar && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Editar ${t.nombre}`}
                            title={pasada ? "La temporada terminó: no se puede editar." : "Editar"}
                            disabled={pasada}
                            onClick={() => setModal({ tipo: "editar", registro: t })}
                            className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-md text-piedra transition-colors hover:bg-hueso hover:text-tinta disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Pencil size={16} strokeWidth={1.6} aria-hidden="true" />
                          </button>
                          {/* Misma caja de 36 px aunque la Base no tenga menú, para que la columna no se corra. */}
                          <div className="h-9 w-9 flex-none">
                            <MenuAcciones grande etiqueta={`Acciones de ${t.nombre}`} acciones={acciones} />
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              }}
            />
          </>
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
