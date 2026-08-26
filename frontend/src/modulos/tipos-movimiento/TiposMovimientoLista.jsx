import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { listarTiposMovimiento } from "./tiposMovimiento.api";
import { TIPOS_NOMBRES } from "./tiposMovimiento.constantes";

const VARIANTE_POR_TIPO = { E: "ok", S: "alerta" };

export function TiposMovimientoLista() {
  const { data: tipos, isLoading, isError } = useQuery({
    queryKey: ["tipos-movimiento"],
    queryFn: listarTiposMovimiento,
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando tipos de movimiento…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los tipos de movimiento.</p>;

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold">
        <ArrowRightLeft size={20} className="text-pino" /> Tipos de movimiento de stock
      </h2>
      <Table
        columnas={["Descripción", "Tipo"]}
        filas={tipos}
        vacio="Todavía no hay tipos de movimiento cargados."
        renderFila={(t) => (
          <tr key={t.id} className="border-b border-borde last:border-0">
            <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{t.descripcion}</td>
            <td className="px-3 py-2">
              <Badge variante={VARIANTE_POR_TIPO[t.tipo]}>{TIPOS_NOMBRES[t.tipo] ?? t.tipo}</Badge>
            </td>
          </tr>
        )}
      />
    </div>
  );
}
