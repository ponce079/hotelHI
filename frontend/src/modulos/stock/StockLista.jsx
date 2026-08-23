import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Package } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { FilterBar } from "../../componentes/FilterBar";
import { listarStock } from "./stock.api";
import { listarDepositos } from "../depositos/depositos.api";

// Umbral simple para marcar "bajo": stockActual <= stockMinimo (cuando hay mínimo definido).
function esStockBajo(fila) {
  return Number(fila.stockMinimo) > 0 && Number(fila.stockActual) <= Number(fila.stockMinimo);
}

export function StockLista() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoria = searchParams.get("categoria") || "";
  const depositoId = searchParams.get("deposito") || "";
  const q = searchParams.get("q") || "";

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });

  const {
    data: stock,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["stock", { categoria, depositoId }],
    queryFn: () => listarStock({ categoria: categoria || undefined, depositoId: depositoId || undefined }),
  });

  // Categorías disponibles: se calculan de los datos ya traídos (no hay
  // endpoint propio de categorías, así evitamos depender de un módulo ajeno).
  const categorias = useMemo(() => {
    if (!stock) return [];
    return [...new Set(stock.map((f) => f.categoria))].sort();
  }, [stock]);

  const filasFiltradas = useMemo(() => {
    if (!stock) return [];
    if (!q.trim()) return stock;
    const texto = q.trim().toLowerCase();
    return stock.filter((f) => f.nombre.toLowerCase().includes(texto));
  }, [stock, q]);

  function actualizarFiltro(clave, valor) {
    const nuevos = new URLSearchParams(searchParams);
    if (valor) nuevos.set(clave, valor);
    else nuevos.delete(clave);
    setSearchParams(nuevos);
  }

  function limpiarFiltros() {
    setSearchParams({});
  }

  if (isLoading) return <p className="text-sm text-piedra">Cargando stock...</p>;
  if (isError) return <p className="text-sm text-error">No se pudo cargar el stock.</p>;

  return (
    <div className="flex flex-col gap-4">
      <FilterBar onClear={limpiarFiltros}>
        <Input
          placeholder="Buscar por nombre..."
          value={q}
          onChange={(e) => actualizarFiltro("q", e.target.value)}
          className="min-w-[220px]"
        />
        <Select value={categoria} onChange={(e) => actualizarFiltro("categoria", e.target.value)}>
          <option value="">Categoría: todas</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={depositoId} onChange={(e) => actualizarFiltro("deposito", e.target.value)}>
          <option value="">Depósito: todos</option>
          {(depositos ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </Select>
      </FilterBar>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <Package size={20} className="text-pino" /> Stock por depósito
        </h2>
        <Table
          columnas={["Artículo", "Categoría", "Unidad", "Depósito", "Stock"]}
          filas={filasFiltradas}
          vacio="No hay stock para los filtros seleccionados."
          renderFila={(f) => (
            <tr key={`${f.articuloId}-${f.depositoId}`} className="border-b border-borde last:border-0">
              <td className="px-3 py-2 font-semibold">{f.nombre}</td>
              <td className="px-3 py-2">{f.categoria}</td>
              <td className="px-3 py-2">{f.unidadMedida}</td>
              <td className="px-3 py-2">{f.deposito}</td>
              <td className="px-3 py-2 font-mono tabular-nums">
                {Number(f.stockActual).toFixed(2)}
                {esStockBajo(f) && <span className="ml-2 text-xs font-sans font-semibold text-alerta">· bajo</span>}
              </td>
            </tr>
          )}
        />
      </div>
    </div>
  );
}
