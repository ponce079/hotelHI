import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { Button } from "../../componentes/Button";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { formatearMonto } from "../../lib/moneda";
import { TarifasTabs } from "./TarifasTabs";
import { TarifaHistorialModal } from "./TarifaHistorialModal";
import { ModificadorDiaSemanaModal } from "./ModificadorDiaSemanaModal";
import { obtenerGrillaTarifas } from "./tarifas.api";

export function PreciosPage() {
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const [celdaAbierta, setCeldaAbierta] = useState(null); // { tipo, temporada }
  const [modificadoresAbiertos, setModificadoresAbiertos] = useState(false);

  if (!puede("verTarifas")) return <SinPermiso />;
  const puedeGestionar = puede("gestionarTarifas");

  const { data: grilla, isLoading, isError } = useQuery({
    queryKey: ["tarifas", "precios", "grilla"],
    queryFn: obtenerGrillaTarifas,
  });

  const celdaPorClave = new Map((grilla?.celdas ?? []).map((c) => [`${c.tipoHabitacionId}-${c.temporadaId}`, c]));

  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Tarifas</h1>
          <p className="text-sm text-piedra">Precio vigente hoy por tipo de habitación × temporada, plan BAR.</p>
        </div>
        {puedeGestionar && (
          <Button variante="secundario" icono={SlidersHorizontal} onClick={() => setModificadoresAbiertos(true)}>
            Modificadores por día
          </Button>
        )}
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-piedra">Cargando…</p>}
      {isError && <p className="py-8 text-center text-sm text-error">No se pudo calcular la grilla de tarifas.</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-lg border border-borde bg-white">
          {(grilla?.tipos ?? []).length === 0 || (grilla?.temporadas ?? []).length === 0 ? (
            <p className="px-6 py-12 text-center text-[13.5px] text-piedra">
              Hace falta al menos un tipo de habitación activo y una temporada activa para armar la grilla.
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-borde bg-hueso">
                  <th className="px-3 py-2.5 text-[12px] font-semibold text-tinta/70">Tipo \ Temporada</th>
                  {grilla.temporadas.map((t) => (
                    <th key={t.id} className="px-3 py-2.5 text-[12px] font-semibold text-tinta/70">
                      {t.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grilla.tipos.map((tipo) => (
                  <tr key={tipo.id} className="border-b border-borde last:border-0">
                    <td className="px-3 py-2.5 text-[13px] font-semibold">{tipo.nombre}</td>
                    {grilla.temporadas.map((temporada) => {
                      const celda = celdaPorClave.get(`${tipo.id}-${temporada.id}`);
                      const vigente = celda?.tarifaVigente;
                      return (
                        <td key={temporada.id} className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setCeldaAbierta({ tipo, temporada })}
                            className={`flex w-full cursor-pointer flex-col items-start rounded-md border px-2.5 py-1.5 text-left hover:bg-hueso ${
                              celda?.sinVigente ? "border-error bg-error-suave" : "border-borde"
                            }`}
                          >
                            {vigente ? (
                              <>
                                <span className="font-mono text-[13px] font-semibold">$ {formatearMonto(vigente.precioBase)}</span>
                                <span className="text-[10.5px] text-piedra">+$ {formatearMonto(vigente.adicionalAdultoExtra)}/adulto extra</span>
                              </>
                            ) : (
                              <span className="flex items-center gap-1 text-[11.5px] text-error-texto">
                                <AlertTriangle size={12} /> Sin tarifa vigente
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
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
