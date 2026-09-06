import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Zap, ClipboardList } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { Pagination } from "../../componentes/Pagination";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { LimpiarFiltros } from "../../componentes/LimpiarFiltros";
import { RequerimientoModal } from "./RequerimientoModal";
import { AnularRequerimientoModal } from "./AnularRequerimientoModal";
import { listarRequerimientos } from "./requerimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { ESTADOS_REQUERIMIENTO, VARIANTE_ESTADO_REQUERIMIENTO, ORIGENES_REQUERIMIENTO } from "../../lib/constantes";
import { formatearFechaSolo } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";

const PAGE_SIZE = 10;

// Mismos colores por estado que ArticulosLista/ProveedoresLista (guía
// visual, sección 5): activo = pino, en curso = laton (mismo tono que su
// Badge "alerta"), todos = tinta.
const ESTADOS = [
  { valor: "", label: "Todos", activo: "border-tinta bg-tinta text-hueso" },
  { valor: ESTADOS_REQUERIMIENTO.PENDIENTE, label: "Pendiente", activo: "border-laton bg-laton text-hueso" },
  { valor: ESTADOS_REQUERIMIENTO.EN_COTIZACION, label: "En cotización", activo: "border-laton bg-laton text-hueso" },
  { valor: ESTADOS_REQUERIMIENTO.APROBADO, label: "Aprobado", activo: "border-pino bg-pino text-hueso" },
];

export function RequerimientosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();

  const q = searchParams.get("q") ?? "";
  const estado = searchParams.get("estado") ?? "";
  const depositoId = searchParams.get("depositoId") ?? "";
  const page = Number(searchParams.get("page")) || 1;

  const [modal, setModal] = useState(null); // null | { prefill } | { requerimiento }
  const [paraAnular, setParaAnular] = useState(null);

  // Alta desde Alertas (HU-8 -> HU-81): la alerta navega acá con estos
  // parámetros para abrir el modal ya precargado. Se leen una sola vez al
  // montar y se limpian de la URL para no quedar mezclados con los
  // filtros del listado.
  useEffect(() => {
    const origenParam = searchParams.get("origen");
    const articuloIdParam = Number(searchParams.get("articuloId"));
    if (origenParam === ORIGENES_REQUERIMIENTO.ALERTA && Number.isInteger(articuloIdParam) && articuloIdParam > 0) {
      setModal({
        prefill: {
          origen: ORIGENES_REQUERIMIENTO.ALERTA,
          depositoId: searchParams.get("depositoId") ?? "",
          articuloId: articuloIdParam,
          cantidad: searchParams.get("cantidad") ?? "",
        },
      });
      const params = new URLSearchParams(searchParams);
      ["origen", "articuloId", "cantidad", "depositoId"].forEach((k) => params.delete(k));
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["requerimientos", { q, estado, depositoId, page }],
    // incluirAnulados: esta es la pantalla de seguimiento — un anulado se ve
    // igual (con su propio badge), no desaparece del historial.
    queryFn: () => listarRequerimientos({ q, estado, depositoId, page, pageSize: PAGE_SIZE, incluirAnulados: true }),
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

  function limpiarFiltros() {
    const params = new URLSearchParams(searchParams);
    ["q", "estado", "depositoId"].forEach((k) => params.delete(k));
    params.set("page", "1");
    setSearchParams(params);
  }

  const hayFiltros = q || estado || depositoId;

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
            <div className="relative min-w-[240px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
              <input
                value={q}
                onChange={(e) => actualizarFiltro("q", e.target.value)}
                placeholder="Buscar por número, depósito o solicitante…"
                className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </div>

            <Select value={depositoId} onChange={(e) => actualizarFiltro("depositoId", e.target.value)}>
              <option value="">Todos los depósitos</option>
              {(depositos ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </Select>

            <div className="inline-flex overflow-hidden rounded-full border border-borde">
              {ESTADOS.map((e) => (
                <button
                  key={e.valor}
                  type="button"
                  onClick={() => actualizarFiltro("estado", e.valor)}
                  className={`cursor-pointer whitespace-nowrap px-4 py-2 text-[12.5px] font-medium ${
                    estado === e.valor ? e.activo : "bg-transparent text-tinta hover:bg-hueso"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>

            {hayFiltros && <LimpiarFiltros onClick={limpiarFiltros} />}

            <Button onClick={() => setModal({ prefill: null })}>+ Nuevo requerimiento</Button>
          </div>

          {isLoading && <p className="text-sm text-piedra">Cargando requerimientos…</p>}
          {isError && <p className="text-sm text-error">No se pudieron cargar los requerimientos.</p>}

          {data && (
            <div className="rounded-lg border border-borde bg-white p-5">
              <div className="mb-3 text-xs text-piedra">
                {data.total} requerimiento{data.total === 1 ? "" : "s"}
              </div>
              <Table
                columnas={["N°", "Fecha", "Depósito", "Artículos", "Presupuestos", "Estado", ""]}
                columnasDerecha={["Artículos", "Presupuestos"]}
                filas={data.items}
                vacio={hayFiltros ? "Ningún requerimiento coincide con los filtros." : "Todavía no hay requerimientos cargados."}
                renderFila={(r) => {
                  // Editar/Anular solo tienen sentido en "Pendiente": una
                  // vez que se pidieron presupuestos, el requerimiento
                  // queda congelado (ver comentario en requerimientos.servicio.js).
                  const puedeModificar = r.estado === ESTADOS_REQUERIMIENTO.PENDIENTE && !r.anulado;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/requerimientos/${r.id}`)}
                      className={`cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${r.anulado ? "opacity-55" : ""}`}
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
                        {r.anulado ? (
                          <Badge variante="neutro">Anulado</Badge>
                        ) : (
                          <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[r.estado] ?? "neutro"}>{r.estado}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {puedeModificar && (
                          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {puede("gestionarPresupuestos") && (
                              <Button
                                tamano="fila"
                                onClick={() => navigate(`/presupuestos?solicitarRequerimientoId=${r.id}`)}
                              >
                                Solicitar presupuesto
                              </Button>
                            )}
                            <Button variante="secundario" tamano="fila" onClick={() => setModal({ requerimientoId: r.id })}>
                              Editar
                            </Button>
                            <Button variante="baja" tamano="fila" onClick={() => setParaAnular(r)}>
                              Anular
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                }}
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

      {modal && (
        <RequerimientoModal
          prefill={modal.prefill}
          requerimientoId={modal.requerimientoId}
          onClose={() => setModal(null)}
          onExito={(mensaje) => {
            setModal(null);
            mostrarToast(mensaje);
          }}
        />
      )}

      {paraAnular && (
        <AnularRequerimientoModal
          requerimiento={paraAnular}
          onClose={() => setParaAnular(null)}
          onExito={(mensaje) => {
            setParaAnular(null);
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
