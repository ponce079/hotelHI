import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { consultarStock } from "../stock/stock.api";
import { calcularAlertas } from "../../lib/alertas";
import { ORIGENES_REQUERIMIENTO } from "../../lib/constantes";
import { useSesion } from "../../lib/sesion";

export function AlertasPage() {
  const navigate = useNavigate();
  const { puede } = useSesion();
  const { data: filas, isLoading, isError } = useQuery({ queryKey: ["stock", {}], queryFn: () => consultarStock({}) });

  const alertas = calcularAlertas(filas);

  function irADeposito(depositoId) {
    navigate(`/depositos/${depositoId}?criticos=1`);
  }

  // HU-81: el alta desde una alerta usa el mismo formulario y el mismo
  // endpoint que la carga manual — solo llega precargado y con
  // origen="ALERTA", que es lo que después muestra el ⚡ en el listado.
  function generarRequerimiento(alerta) {
    const params = new URLSearchParams({
      origen: ORIGENES_REQUERIMIENTO.ALERTA,
      depositoId: String(alerta.depositoId),
      articuloId: String(alerta.articuloId),
      // ¡Ojo con !: un sugerido de 0 es un valor legítimo (stockMinimo
      // === stockMaximo), no "no hay sugerencia" — con solo `sugerido ?`
      // ese 0 se perdía y el parámetro quedaba ausente. Nota: pedir 0
      // unidades no tiene sentido, así que RequerimientoFormPage igual
      // descarta un cantidad<=0 al leer la querystring y el campo queda
      // vacío en la pantalla — este fix no cambia esa UX, solo hace que
      // la URL generada refleje el valor real de la alerta.
      ...(alerta.sugerido != null ? { cantidad: String(alerta.sugerido) } : {}),
    });
    navigate(`/requerimientos/nuevo?${params}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <TriangleAlert size={22} className="text-error" /> Alertas de Stock
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">HU 8 — alerta automática al alcanzar el mínimo</p>
        <p className="mt-2 text-sm text-piedra">
          Se abren solas al cruzar el mínimo y se cierran solas cuando el stock se recupera.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge variante="error">{alertas.length} alertas abiertas</Badge>
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando…</p>}
      {isError && <p className="text-sm text-error">No se pudieron cargar las alertas.</p>}

      {!isLoading && alertas.length === 0 && (
        <div className="rounded-lg border border-borde bg-white p-6">
          <p className="text-sm">Ningún artículo está en su mínimo. Nada que reponer por ahora.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {alertas.map((a) => (
          <div key={a.articuloDepositoId} className="flex flex-col gap-3 rounded-lg border border-error/40 bg-error-suave p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-heading text-lg leading-tight">{a.nombre}</div>
                <div className="text-xs text-piedra">
                  ART-{String(a.articuloId).padStart(4, "0")} · {a.deposito}
                </div>
              </div>
              <Badge variante="error">Crítico</Badge>
            </div>
            <div className="flex gap-5 border-t border-error/20 pt-3">
              <div>
                <div className="text-[10px] text-piedra">Stock actual</div>
                <div className="font-heading text-lg text-error-texto">{a.stockActual}</div>
              </div>
              <div>
                <div className="text-[10px] text-piedra">Mínimo</div>
                <div className="font-heading text-lg">{a.stockMinimo}</div>
              </div>
              <div>
                <div className="text-[10px] text-piedra">Sugerido a comprar</div>
                <div className="font-heading text-lg">
                  {a.sugerido ?? "—"} <span className="font-body text-xs">{a.unidadMedida}</span>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 self-center">
                {puede("crearRequerimiento") && (
                  <Button tamano="fila" onClick={() => generarRequerimiento(a)}>
                    Generar requerimiento
                  </Button>
                )}
                <Button variante="secundario" tamano="fila" onClick={() => irADeposito(a.depositoId)}>
                  Ver depósito
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
