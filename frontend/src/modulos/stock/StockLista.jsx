import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Gauge } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { FilterBar } from "../../componentes/FilterBar";
import { consultarStock } from "./stock.api";
import { listarArticulos } from "../articulos/articulos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { CATEGORIAS, UNIDADES_MEDIDA_NOMBRES } from "../articulos/articulos.constantes";

export function StockLista() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const articuloId = searchParams.get("articuloId") ?? "";
  const categoria = searchParams.get("categoria") ?? "";
  const depositoId = searchParams.get("depositoId") ?? "";

  const { data: articulos } = useQuery({
    queryKey: ["articulos", "todos"],
    queryFn: () => listarArticulos({ pageSize: 100 }),
  });
  const { data: depositos } = useQuery({
    queryKey: ["depositos"],
    queryFn: listarDepositos,
  });

  const {
    data: stock,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["stock", { articuloId, categoria, depositoId }],
    queryFn: () => consultarStock({ articuloId, categoria, depositoId }),
  });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) {
      params.set(clave, valor);
    } else {
      params.delete(clave);
    }
    setSearchParams(params);
  }

  const filasFiltradas = (stock ?? []).filter((f) =>
    q.trim() ? f.nombre.toLowerCase().includes(q.trim().toLowerCase()) : true
  );

  const hayFiltros = Boolean(q || articuloId || categoria || depositoId);

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold">
        <Gauge size={20} className="text-pino" /> Stock por artículo y depósito
      </h2>

      <div className="mb-4">
        <FilterBar onClear={hayFiltros ? () => setSearchParams({}) : undefined}>
          <Input
            placeholder="Buscar por nombre..."
            value={q}
            onChange={(e) => actualizarFiltro("q", e.target.value)}
            className="min-w-[200px]"
          />
          <Select value={categoria} onChange={(e) => actualizarFiltro("categoria", e.target.value)}>
            <option value="">Categoría: todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={articuloId} onChange={(e) => actualizarFiltro("articuloId", e.target.value)}>
            <option value="">Artículo: todos</option>
            {(articulos?.items ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Select>
          <Select value={depositoId} onChange={(e) => actualizarFiltro("depositoId", e.target.value)}>
            <option value="">Depósito: todos</option>
            {(depositos ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </Select>
        </FilterBar>
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando stock...</p>}
      {isError && <p className="text-sm text-error">No se pudo consultar el stock.</p>}

      {stock && (
        <Table
          columnas={["Artículo", "Categoría", "Unidad", "Depósito", "Stock actual", "Mínimo", "Máximo"]}
          filas={filasFiltradas}
          vacio={hayFiltros ? "Ningún resultado coincide con los filtros." : "Todavía no hay artículos habilitados con stock."}
          renderFila={(s) => {
            const bajoMinimo = Number(s.stockActual) < Number(s.stockMinimo);
            return (
              <tr key={`${s.articuloId}-${s.depositoId}`} className="border-b border-borde last:border-0">
                <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{s.nombre}</td>
                <td className="px-3 py-2 font-body text-[12.5px]">{s.categoria}</td>
                <td className="px-3 py-2 font-body text-[12.5px]">{UNIDADES_MEDIDA_NOMBRES[s.unidadMedida] ?? s.unidadMedida}</td>
                <td className="px-3 py-2 font-body text-[12.5px]">{s.deposito}</td>
                <td className="px-3 py-2">
                  <Cifra tamano={15} className={bajoMinimo ? "text-error-texto" : ""}>{Number(s.stockActual).toFixed(2)}</Cifra>
                </td>
                <td className="px-3 py-2 font-body text-[12.5px] text-tinta/55">{Number(s.stockMinimo).toFixed(2)}</td>
                <td className="px-3 py-2 font-body text-[12.5px] text-tinta/55">{s.stockMaximo != null ? Number(s.stockMaximo).toFixed(2) : "—"}</td>
              </tr>
            );
          }}
        />
      )}
    </div>
  );
}
