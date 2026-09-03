import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Diamond } from "lucide-react";
import { Select } from "../../componentes/Select";
import { Input } from "../../componentes/Input";
import { FilterBar } from "../../componentes/FilterBar";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Pagination } from "../../componentes/Pagination";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { formatearMonto } from "../../lib/moneda";
import { listarOrdenesCompra } from "./ordenesCompra.api";
import { ESTADOS_OC, BADGE_ESTADO_OC } from "./ordenesCompra.constantes";

const FILTROS_VACIOS = { estado: "", proveedorId: "", desde: "", hasta: "" };
const PAGE_SIZE = 10;

export function OrdenesCompraPage() {
  const { puede } = useSesion();
  const tienePermiso = puede("verOrdenesCompra");
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);

  useEffect(() => setPagina(1), [filtros]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ordenes-compra", "listado", filtros, pagina],
    queryFn: () => listarOrdenesCompra({ ...filtros, page: pagina, pageSize: PAGE_SIZE }),
    enabled: tienePermiso,
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

  const hayFiltros = filtros.estado || filtros.proveedorId || filtros.desde || filtros.hasta;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <ShoppingCart size={26} className="text-pino" /> Órdenes de Compra
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 22, 23, 24, 25, 85 — seguimiento de aprobación, envío, recepción y cierre
        </p>
      </div>

      <FilterBar onClear={hayFiltros ? () => setFiltros(FILTROS_VACIOS) : undefined}>
        <div className="min-w-[170px]">
          <Select label="Estado" value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            {ESTADOS_OC.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Select label="Proveedor" value={filtros.proveedorId} onChange={(e) => setFiltros((f) => ({ ...f, proveedorId: e.target.value }))}>
            <option value="">Todos los proveedores</option>
            {proveedoresDisponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[150px]">
          <Input type="date" label="Desde" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
        </div>
        <div className="w-[150px]">
          <Input type="date" label="Hasta" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} />
        </div>
      </FilterBar>

      <div className="flex flex-col gap-3 rounded-[18.4px] bg-white px-6 py-4">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar las órdenes de compra.</p>
        ) : (
          <>
            <div className="flex items-center justify-between pb-1">
              <span className="font-body text-[12.5px] text-tinta/55">{data?.total ?? 0} orden(es) de compra</span>
              <span className="flex items-center gap-1 font-body text-[11.5px] text-tinta/50">
                <Diamond size={11} className="fill-error text-error" /> marca las OC recibidas con diferencia
              </span>
            </div>
            <Table
              columnas={["N° OC", "Proveedor", "Monto total", "Estado", "Fecha"]}
              columnasDerecha={["Monto total"]}
              filas={data?.items ?? []}
              vacio="Ninguna orden de compra coincide con los filtros."
              renderFila={(o) => (
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
                </tr>
              )}
            />
            {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPagina} />}
          </>
        )}
      </div>
    </div>
  );
}
