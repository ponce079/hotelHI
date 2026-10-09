import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { Button } from "../../componentes/Button";
import { PageHeader } from "../../componentes/PageHeader";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { formatearDiaSemanaMes, hoyEnHoraLocal } from "../../lib/fechas";
import { TarifasTabs } from "./TarifasTabs";
import { TarifaHistorialModal } from "./TarifaHistorialModal";
import { ModificadorDiaSemanaModal } from "./ModificadorDiaSemanaModal";
import { obtenerCalendario, obtenerGrillaTarifas } from "./tarifas.api";
import { prepararFilasMatriz, textoAdicionalMatriz, textoPrecioMatriz } from "./tarifas.matriz";

// Con más tipos que estos la matriz deja de entrar en 1366 px: las columnas toman un ancho mínimo y la tarjeta
// scrollea por dentro (la columna de temporada queda fija).
const MAX_TIPOS_SIN_SCROLL = 4;

function ChipNivel({ nivel }) {
  const clave = nivel.toLowerCase();
  return (
    <span
      className="inline-flex items-center rounded-sm px-2 py-px text-[11px] font-semibold tracking-[0.04em]"
      style={{ backgroundColor: `var(--nivel-${clave}-bg)`, color: `var(--nivel-${clave}-texto)` }}
    >
      {nivel}
    </span>
  );
}

function fechasDeTemporada(temporada) {
  if (temporada.nivel === "BASE" || !temporada.fechaDesde || !temporada.fechaHasta) return "Resto de las fechas";
  return `${formatearDiaSemanaMes(temporada.fechaDesde)} → ${formatearDiaSemanaMes(temporada.fechaHasta)}`;
}

export function PreciosPage() {
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const [celdaAbierta, setCeldaAbierta] = useState(null); // { tipo, temporada }
  const [modificadoresAbiertos, setModificadoresAbiertos] = useState(false);
  const [mostrarPasadas, setMostrarPasadas] = useState(false);
  const hoy = hoyEnHoraLocal();
  const puedeVer = puede("verTarifas");

  const { data: grilla, isLoading, isError } = useQuery({
    enabled: puedeVer,
    queryKey: ["tarifas", "precios", "grilla"],
    queryFn: obtenerGrillaTarifas,
  });

  // Temporada que aplica hoy: la resuelve el backend con la misma regla de prioridad que el motor de cotización.
  const { data: diaHoy } = useQuery({
    enabled: puedeVer,
    queryKey: ["tarifas", "calendario", "hoy", hoy],
    queryFn: () => obtenerCalendario(hoy, hoy),
  });

  if (!puedeVer) return <SinPermiso />;
  const puedeGestionar = puede("gestionarTarifas");

  const temporadaHoyId = diaHoy?.[0]?.temporadaId ?? null;
  const celdaPorClave = new Map((grilla?.celdas ?? []).map((c) => [`${c.tipoHabitacionId}-${c.temporadaId}`, c]));
  const tipos = grilla?.tipos ?? [];
  const filas = prepararFilasMatriz(grilla?.temporadas ?? [], hoy, mostrarPasadas);
  const hayPasadas = (grilla?.temporadas ?? []).length > prepararFilasMatriz(grilla?.temporadas ?? [], hoy, false).length;
  const conScroll = tipos.length > MAX_TIPOS_SIN_SCROLL;

  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas" />

      <PageHeader
        titulo="Tarifas"
        subtitulo="Precio vigente por noche, plan BAR, IVA incluido."
        acciones={
          puedeGestionar && (
            <Button variante="secundario" icono={SlidersHorizontal} onClick={() => setModificadoresAbiertos(true)}>
              Modificadores por día
            </Button>
          )
        }
      />

      {isLoading && <p className="py-8 text-center text-sm text-piedra">Cargando…</p>}
      {isError && <p className="py-8 text-center text-sm text-error">No se pudo calcular la grilla de tarifas.</p>}

      {!isLoading && !isError && (
        <div className="rounded-lg border border-borde bg-white">
          {tipos.length === 0 || (grilla?.temporadas ?? []).length === 0 ? (
            <p className="px-6 py-12 text-center text-[13.5px] text-piedra">
              Hace falta al menos un tipo de habitación activo y una temporada activa para armar la grilla.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--divisor-fila)] px-4 py-2.5">
                <p className="text-[12.5px] text-[var(--text-3)]">
                  {filas.length} {filas.length === 1 ? "temporada" : "temporadas"} · {tipos.length} {tipos.length === 1 ? "tipo" : "tipos"} de habitación
                </p>
                {hayPasadas && (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-tinta">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={mostrarPasadas}
                      onChange={(e) => setMostrarPasadas(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                    />
                    Mostrar temporadas pasadas
                  </label>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-borde bg-hueso">
                      <th scope="col" className="sticky left-0 z-10 min-w-[220px] bg-hueso px-4 py-3 text-[12px] font-semibold text-[var(--text-3)]">
                        Temporada
                      </th>
                      {tipos.map((tipo) => (
                        <th key={tipo.id} scope="col" className={`px-4 py-3 align-bottom ${conScroll ? "min-w-[200px]" : ""}`}>
                          <span className="block text-[13px] font-semibold text-tinta">{tipo.nombre}</span>
                          <span className="block text-[12px] font-normal text-[var(--text-3)]">
                            incluye {tipo.ocupacionBase} {tipo.ocupacionBase === 1 ? "adulto" : "adultos"}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(({ temporada, pasada }) => {
                      const esHoy = temporada.id === temporadaHoyId;
                      const fondo = esHoy ? "bg-[var(--fila-hoy-bg)]" : "bg-white";
                      return (
                        <tr key={temporada.id} className={`border-b border-[var(--divisor-fila)] last:border-0 ${fondo}`}>
                          <th scope="row" className={`sticky left-0 z-10 px-4 py-3 text-left align-top font-normal ${fondo}`}>
                            <span className="flex flex-wrap items-center gap-2">
                              <span className={`text-[13.5px] font-semibold ${pasada ? "text-[var(--text-3)]" : "text-tinta"}`}>{temporada.nombre}</span>
                              <ChipNivel nivel={temporada.nivel} />
                              {esHoy && (
                                <span className="rounded-full bg-[var(--primary)] px-2 py-px text-[11px] font-semibold text-[var(--on-color)]">HOY</span>
                              )}
                            </span>
                            <span className="mt-1 block text-[12px] text-[var(--text-3)]">{fechasDeTemporada(temporada)}</span>
                          </th>
                          {tipos.map((tipo) => {
                            const vigente = celdaPorClave.get(`${tipo.id}-${temporada.id}`)?.tarifaVigente;
                            const adicional = vigente ? textoAdicionalMatriz(vigente) : null;
                            return (
                              <td key={tipo.id} className="h-px p-0 align-top">
                                <button
                                  type="button"
                                  aria-label={`${tipo.nombre}, ${temporada.nombre}`}
                                  onClick={() => setCeldaAbierta({ tipo, temporada })}
                                  className="group block h-full w-full cursor-pointer px-4 py-3 text-left hover:bg-hueso"
                                >
                                  {vigente ? (
                                    <>
                                      <span className={`flex items-center gap-2 font-mono text-[15px] font-semibold ${pasada ? "text-[var(--text-3)]" : "text-tinta"}`}>
                                        {textoPrecioMatriz(vigente)}
                                        <Pencil size={13} aria-hidden="true" className="text-[var(--text-3)] group-hover:text-[var(--primary)]" />
                                      </span>
                                      {adicional && <span className="mt-0.5 block text-[12px] text-[var(--text-3)]">{adicional}</span>}
                                    </>
                                  ) : (
                                    <span className="flex items-center gap-2 text-[15px] text-[var(--text-3)]">
                                      —
                                      {puedeGestionar && <span className="text-[13px] font-semibold text-[var(--primary)] underline">Cargar</span>}
                                      <Pencil size={13} aria-hidden="true" className="group-hover:text-[var(--primary)]" />
                                    </span>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {celdaAbierta && (
        <TarifaHistorialModal
          tipo={celdaAbierta.tipo}
          temporada={celdaAbierta.temporada}
          puedeGestionar={puedeGestionar}
          onClose={() => setCeldaAbierta(null)}
          onExito={mostrarToast}
        />
      )}

      {modificadoresAbiertos && <ModificadorDiaSemanaModal onClose={() => setModificadoresAbiertos(false)} onExito={mostrarToast} />}

      <Toast mensaje={toast} />
    </div>
  );
}
