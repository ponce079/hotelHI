import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Package, Search } from "lucide-react";
import { Table } from "../../componentes/Table";
import { FilterBar } from "../../componentes/FilterBar";
import { Pagination } from "../../componentes/Pagination";
import { listarArticulos } from "./articulos.api";
import { UNIDADES_MEDIDA, UNIDADES_MEDIDA_NOMBRES, CATEGORIAS } from "./articulos.constantes";

const PAGE_SIZE = 10;

export function ArticulosLista() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const categoria = searchParams.get("categoria") ?? "";
  const unidadMedida = searchParams.get("unidadMedida") ?? "";
  const page = Number(searchParams.get("page")) || 1;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["articulos", { q, categoria, unidadMedida, page }],
    queryFn: () => listarArticulos({ q, categoria, unidadMedida, page, pageSize: PAGE_SIZE }),
  });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) {
      params.set(clave, valor);
    } else {
      params.delete(clave);
    }
    params.set("page", "1");
    setSearchParams(params);
  }

  function irAPagina(nuevaPagina) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nuevaPagina));
    setSearchParams(params);
  }

  const hayFiltros = Boolean(q || categoria || unidadMedida);

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Package size={20} className="text-pino" /> Catálogo de artículos
      </h2>

      <div className="mb-4">
        <FilterBar onClear={hayFiltros ? () => setSearchParams({}) : undefined}>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
            <input
              value={q}
              onChange={(e) => actualizarFiltro("q", e.target.value)}
              placeholder="Buscar por nombre…"
              className="w-full rounded-md border border-borde py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
            />
          </div>
          <select
            value={categoria}
            onChange={(e) => actualizarFiltro("categoria", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-2.5 py-1.5 text-sm"
          >
            <option value="">Categoría: todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={unidadMedida}
            onChange={(e) => actualizarFiltro("unidadMedida", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-2.5 py-1.5 text-sm"
          >
            <option value="">Unidad: todas</option>
            {UNIDADES_MEDIDA.map((u) => (
              <option key={u} value={u}>
                {UNIDADES_MEDIDA_NOMBRES[u]}
              </option>
            ))}
          </select>
        </FilterBar>
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando artículos…</p>}
      {isError && <p className="text-sm text-error">No se pudieron cargar los artículos.</p>}

      {data && (
        <>
          <Table
            columnas={["Código", "Nombre", "Unidad", "Categoría"]}
            filas={data.items}
            vacio={hayFiltros ? "Ningún artículo coincide con los filtros." : "Todavía no hay artículos cargados."}
            renderFila={(a) => (
              <tr key={a.id} className="border-b border-borde last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                <td className="px-3 py-2">{a.nombre}</td>
                <td className="px-3 py-2">{UNIDADES_MEDIDA_NOMBRES[a.unidadMedida] ?? a.unidadMedida}</td>
                <td className="px-3 py-2">{a.categoria}</td>
              </tr>
            )}
          />
          <div className="mt-3">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={irAPagina} />
          </div>
        </>
      )}
    </div>
  );
}
