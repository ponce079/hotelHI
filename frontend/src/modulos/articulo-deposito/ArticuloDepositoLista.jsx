import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { listarHabilitaciones } from "./articuloDeposito.api";

export function ArticuloDepositoLista() {
  const { data: habilitaciones, isLoading, isError } = useQuery({
    queryKey: ["articulo-depositos"],
    queryFn: listarHabilitaciones,
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando habilitaciones…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar las habilitaciones.</p>;

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Boxes size={20} className="text-pino" /> Artículos habilitados por depósito
      </h2>
      <Table
        columnas={["Artículo", "Depósito", "Estado"]}
        filas={habilitaciones}
        vacio="Todavía no hay artículos habilitados en ningún depósito."
        renderFila={(h) => (
          <tr key={h.id} className="border-b border-borde last:border-0">
            <td className="px-3 py-2">
              <span className="font-mono text-xs">{h.articulo.codigo}</span> — {h.articulo.descripcion}
            </td>
            <td className="px-3 py-2">{h.deposito.nombre}</td>
            <td className="px-3 py-2">
              <Badge variante={h.activo ? "ok" : "error"}>{h.activo ? "Activo" : "Inactivo"}</Badge>
            </td>
          </tr>
        )}
      />
    </div>
  );
}
