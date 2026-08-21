import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Table } from "../../componentes/Table";
import { listarArticulos } from "./articulos.api";
import { UNIDADES_MEDIDA_NOMBRES } from "./articulos.constantes";

export function ArticulosLista() {
  const { data: articulos, isLoading, isError } = useQuery({
    queryKey: ["articulos"],
    queryFn: listarArticulos,
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando artículos…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los artículos.</p>;

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Package size={20} className="text-pino" /> Catálogo de artículos
      </h2>
      <Table
        columnas={["Código", "Descripción", "Unidad", "Categoría"]}
        filas={articulos}
        vacio="Todavía no hay artículos cargados."
        renderFila={(a) => (
          <tr key={a.id} className="border-b border-borde last:border-0">
            <td className="px-3 py-2 font-mono text-xs">{a.codigo}</td>
            <td className="px-3 py-2">{a.descripcion}</td>
            <td className="px-3 py-2">{UNIDADES_MEDIDA_NOMBRES[a.unidadMedida] ?? a.unidadMedida}</td>
            <td className="px-3 py-2">{a.categoria}</td>
          </tr>
        )}
      />
    </div>
  );
}
