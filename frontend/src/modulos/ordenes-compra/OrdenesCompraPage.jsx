import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Diamond, Search } from "lucide-react";
import { Select } from "../../componentes/Select";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Pagination } from "../../componentes/Pagination";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { LimpiarFiltros } from "../../componentes/LimpiarFiltros";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";
import { formatearMonto } from "../../lib/moneda";
import { listarOrdenesCompra, generarOrdenCompra } from "./ordenesCompra.api";
import { listarPresupuestos } from "../presupuestos/presupuestos.api";
import { ESTADOS_PRESUPUESTO } from "../../lib/constantes";
import { ESTADOS_OC, BADGE_ESTADO_OC } from "./ordenesCompra.constantes";

const FILTROS_VACIOS = { q: "", estado: "", proveedorId: "", desde: "", hasta: "" };
const PAGE_SIZE = 10;

// Mismo patrón de pastillas que Proveedores (fila "Rubro") y Requerimientos
// (fila "Estado") — acá con más opciones que esas, así que van sueltas con
// gap en vez de un único control segmentado. El color de cada pastilla
// activa sale de BADGE_ESTADO_OC (una sola fuente de verdad con el badge
// de la tabla), no se duplica.
const PILL_ACTIVO_POR_VARIANTE = {
  alerta: "border-laton bg-laton text-hueso",
  ok: "border-pino bg-pino text-hueso",
  neutro: "border-[#867d68] bg-[#867d68] text-hueso",
  error: "border-error bg-error text-hueso",
};
const ESTADOS_FILTRO_OC = [
  { valor: "", label: "Todos", activo: "border-tinta bg-tinta text-hueso" },
  ...ESTADOS_OC.map((estado) => ({
    valor: estado,
    label: estado,
    activo: PILL_ACTIVO_POR_VARIANTE[BADGE_ESTADO_OC[estado]] ?? "border-tinta bg-tinta text-hueso",
  })),
];

export function OrdenesCompraPage() {
  const { puede, usuario } = useSesion();
  const tienePermiso = puede("verOrdenesCompra");
  const navigate = useNavigate();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  // Llega acá desde el botón "Ir a Órdenes de Compra" de la comparación de
  // presupuestos (que ya no genera la OC directamente, solo te trae hasta
  // acá) — resalta la fila de ese presupuesto en la bandeja de abajo. Se
  // lee una sola vez al montar y se limpia de la URL, mismo patrón que el
  // prefill de Alertas en RequerimientosPage.
  const [destacarPresupuestoId, setDestacarPresupuestoId] = useState(null);
  useEffect(() => {
    const id = Number(searchParams.get("generarPresupuestoId"));
    if (Number.isInteger(id) && id > 0) {
      setDestacarPresupuestoId(id);
      const params = new URLSearchParams(searchParams);
      params.delete("generarPresupuestoId");
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setPagina(1), [filtros]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ordenes-compra", "listado", filtros, pagina],
    queryFn: () => listarOrdenesCompra({ ...filtros, page: pagina, pageSize: PAGE_SIZE }),
    enabled: tienePermiso,
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
  }

  // Presupuestos ya adjudicados por el gerente (HU-84) que todavía no
  // tienen una orden de compra generada — es la bandeja de trabajo de
  // compras para HU-22. Ya no se genera desde la comparación de
  // presupuestos, se genera acá.
  const { data: adjudicadosData } = useQuery({
    queryKey: ["presupuestos", { estado: ESTADOS_PRESUPUESTO.ADJUDICADO }],
    queryFn: () => listarPresupuestos({ estado: ESTADOS_PRESUPUESTO.ADJUDICADO }),
    enabled: tienePermiso,
  });
  const presupuestosPorGenerar = (adjudicadosData?.items ?? []).filter((p) => !p.ordenCompra);

  const mutacionGenerar = useMutation({
    mutationFn: (presupuestoId) => generarOrdenCompra(presupuestoId, usuario),
    onSuccess: (oc) => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      mostrarToast(`Orden de compra ${oc.numero} generada.`);
      navigate(`/ordenes-compra/${oc.id}`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo generar la orden de compra."),
  });

  // Mismo truco que PagosPage.jsx: todavía no existe GET /api/proveedores
  // (HU-18 a 21, Tomás/Agustín), así que el selector de proveedor se arma
  // con los proveedores que ya trajo el propio listado, filtrado solo por
  // estado/fecha (no por proveedor) para no autoestrecharse.
  const { data: dataParaFiltro } = useQuery({
    queryKey: ["ordenes-compra", "proveedores-filtro", filtros.estado, filtros.desde, filtros.hasta],
    queryFn: () => listarOrdenesCompra({ estado: filtros.estado, desde: filtros.desde, hasta: filtros.hasta, pageSize: 500 }),
    enabled: tienePermiso,
  });
  const proveedoresDisponibles = useMemo(() => {
    const vistos = new Map();
    (dataParaFiltro?.items ?? []).forEach((o) => vistos.set(o.proveedorId, o.proveedor?.razonSocial));
    return [...vistos.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [dataParaFiltro]);

  if (!tienePermiso) return <SinPermiso />;

  const hayFiltros = filtros.q || filtros.estado || filtros.proveedorId || filtros.desde || filtros.hasta;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <ShoppingCart size={26} className="text-pino" /> Órdenes de Compra
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 22, 24, 25, 85 — seguimiento de envío, recepción y cierre
        </p>
      </div>

      {presupuestosPorGenerar.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-laton bg-laton-100/50 p-5">
          <div>
            <h2 className="font-heading text-[16px] font-semibold text-tinta">
              Presupuestos adjudicados por generar · {presupuestosPorGenerar.length}
            </h2>
            <p className="mt-0.5 text-[12px] text-tinta/60">
              El gerente ya los adjudicó — falta generar la orden de compra para formalizar el pedido.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {presupuestosPorGenerar.map((p) => (
              <div
                key={p.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 ${
                  p.id === destacarPresupuestoId ? "border-pino ring-2 ring-pino/25" : "border-borde"
                }`}
              >
                <div className="min-w-0">
                  <div className="font-body text-[13.5px] font-semibold text-tinta">{p.proveedor?.razonSocial}</div>
                  <div className="text-[11.5px] text-piedra">
                    REQ-{String(p.requerimientoId).padStart(4, "0")}
                    {p.requerimiento?.deposito?.nombre && ` · ${p.requerimiento.deposito.nombre}`}
                    {" · "}$ {formatearMonto(p.total)}
                  </div>
                </div>
                {puede("gestionarOC") ? (
                  <Button
                    disabled={mutacionGenerar.isPending && mutacionGenerar.variables === p.id}
                    onClick={() => mutacionGenerar.mutate(p.id)}
                  >
                    {mutacionGenerar.isPending && mutacionGenerar.variables === p.id
                      ? "Generando…"
                      : "Generar Orden de Compra"}
                  </Button>
                ) : (
                  <span className="text-[12px] text-piedra">La genera el área de compras.</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={filtros.q}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            placeholder="Buscar por N° de OC o proveedor…"
            className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>

        <Select value={filtros.proveedorId} onChange={(e) => setFiltros((f) => ({ ...f, proveedorId: e.target.value }))}>
          <option value="">Todos los proveedores</option>
          {proveedoresDisponibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-piedra">Desde</span>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
            className="rounded-md border border-borde bg-white px-2.5 py-[7px] text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-piedra">Hasta</span>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
            className="rounded-md border border-borde bg-white px-2.5 py-[7px] text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>

        {hayFiltros && <LimpiarFiltros onClick={() => setFiltros(FILTROS_VACIOS)} />}
      </div>

      <div className="flex flex-wrap items-center gap-[7px]">
        <span className="mr-1 text-[11.5px] text-piedra">Estado:</span>
        {ESTADOS_FILTRO_OC.map((e) => (
          <button
            key={e.valor || "todos"}
            type="button"
            onClick={() => setFiltros((f) => ({ ...f, estado: e.valor }))}
            className={`cursor-pointer rounded-full border px-3 py-[5px] text-xs ${
              filtros.estado === e.valor ? e.activo : "border-tinta/20 text-tinta hover:bg-hueso"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar las órdenes de compra.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-xs text-piedra">
              <span>{data?.total ?? 0} orden(es) de compra</span>
              <span className="flex items-center gap-1 text-tinta/50">
                <Diamond size={11} className="fill-error text-error" /> marca las OC recibidas con diferencia
              </span>
            </div>
            <Table
              columnas={["N° OC", "Proveedor", "Monto total", "Estado", "Fecha", ""]}
              columnasDerecha={["Monto total", ""]}
              filas={data?.items ?? []}
              vacio="Ninguna orden de compra coincide con los filtros."
              renderFila={(o) => {
                const puedeRecibir = puede("recibirOC") && o.estado === "Enviada";
                return (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/ordenes-compra/${o.id}`)}
                    className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
                  >
                    <td className="px-2 py-2.5 font-mono text-[12.5px]">
                      <span className="inline-flex items-center gap-1.5">
                        {o.numero}
                        {o.estado === "Recibida con diferencia" && <Diamond size={10} className="fill-error text-error" />}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-[13px]">{o.proveedor?.razonSocial}</td>
                    <td className="px-2 py-2.5 text-right text-[13.5px] font-semibold">
                      $ {formatearMonto(Number(o.montoTotal) + Number(o.flete || 0))}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge variante={BADGE_ESTADO_OC[o.estado] ?? "neutro"}>{o.estado}</Badge>
                    </td>
                    <td className="px-2 py-2.5 text-[12.5px] text-tinta/70">{new Date(o.fecha).toLocaleDateString("es-AR")}</td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {puedeRecibir && (
                          <Button variante="alta" tamano="fila" onClick={() => navigate(`/ordenes-compra/${o.id}/recepcion`)}>
                            Recepción
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
            {data && (
              <div className="mt-3">
                <Pagination page={data.page} totalPages={data.totalPages} onChange={setPagina} />
              </div>
            )}
          </>
        )}
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
