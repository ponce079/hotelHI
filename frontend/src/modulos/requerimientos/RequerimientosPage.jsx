import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Zap, ClipboardList } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { Pagination } from "../../componentes/Pagination";
import { SinPermiso } from "../../componentes/SinPermiso";
import { listarRequerimientos } from "./requerimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { ESTADOS_REQUERIMIENTO, VARIANTE_ESTADO_REQUERIMIENTO, ORIGENES_REQUERIMIENTO } from "../../lib/constantes";
import { formatearFechaSolo } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";

const PAGE_SIZE = 10;

export function RequerimientosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { puede } = useSesion();

  const estado = searchParams.get("estado") ?? "";
  const depositoId = searchParams.get("depositoId") ?? "";
  const page = Number(searchParams.get("page")) || 1;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["requerimientos", { estado, depositoId, page }],
    queryFn: () => listarRequerimientos({ estado, depositoId, page, pageSize: PAGE_SIZE }),
    enabled: puede("crearRequerimiento"),
  });

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    params.set("page", "1");
    setSearchParams(params);
  }

  function irAPagina(nuevaPagina) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nuevaPagina));
    setSearchParams(params);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <ClipboardList size={24} className="text-pino" /> Requerimientos de Reposición
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU-81 — el pedido interno que arranca el ciclo de compra
        </p>
      </div>

      {!puede("crearRequerimiento") ? (
        <SinPermiso />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={estado} onChange={(e) => actualizarFiltro("estado", e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.values(ESTADOS_REQUERIMIENTO).map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>

            <Select value={depositoId} onChange={(e) => actualizarFiltro("depositoId", e.target.value)}>
              <option value="">Todos los depósitos</option>
              {(depositos ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </Select>

            <Button className="ml-auto" onClick={() => navigate("/requerimientos/nuevo")}>
              + Nuevo requerimiento
            </Button>
          </div>

          {isLoading && <p className="text-sm text-piedra">Cargando requerimientos…</p>}
          {isError && <p className="text-sm text-error">No se pudieron cargar los requerimientos.</p>}

          {data && (
            <div className="rounded-lg border border-borde bg-white p-5">
              <div className="mb-3 text-xs text-piedra">
                {data.total} requerimiento{data.total === 1 ? "" : "s"}
              </div>
              <Table
                columnas={["#", "Fecha", "Depósito", "Artículos", "Presupuestos", "Estado"]}
                columnasDerecha={["Artículos", "Presupuestos"]}
                filas={data.items}
                vacio="Todavía no hay requerimientos cargados."
                renderFila={(r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/requerimientos/${r.id}`)}
                    className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className="inline-flex items-center gap-1">
                        REQ-{String(r.id).padStart(4, "0")}
                        {r.origen === ORIGENES_REQUERIMIENTO.ALERTA && (
                          <Zap size={13} className="text-laton" title="Generado desde una alerta de stock mínimo" />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-body text-[12.5px]">{formatearFechaSolo(r.fecha)}</td>
                    <td className="px-3 py-2 font-body text-[12.5px] font-semibold">{r.deposito?.nombre}</td>
                    <td className="px-3 py-2 text-right font-body text-[12.5px]">{r.cantidadArticulos}</td>
                    <td className="px-3 py-2 text-right font-body text-[12.5px]">
                      {r.cantidadPresupuestos === 0 ? (
                        <span className="text-piedra">—</span>
                      ) : (
                        <span>
                          {r.presupuestosCotizados}/{r.cantidadPresupuestos}
                          <span className="ml-1 text-[11px] text-piedra">cotizados</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[r.estado] ?? "neutro"}>{r.estado}</Badge>
                    </td>
                  </tr>
                )}
              />
              <div className="mt-3">
                <Pagination page={data.page} totalPages={data.totalPages} onChange={irAPagina} />
              </div>
            </div>
          )}

          <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
            El ⚡ marca los requerimientos generados desde una alerta de stock mínimo. Un requerimiento llega a
            "Aprobado" solamente cuando el gerente adjudica uno de sus presupuestos.
          </p>
        </div>
      )}
    </div>
  );
}
