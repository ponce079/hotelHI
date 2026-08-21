import { useQuery } from "@tanstack/react-query";
import { Warehouse } from "lucide-react";
import { Table } from "../../componentes/Table";
import { listarDepositos } from "./depositos.api";

export function DepositosLista() {
  const { data: depositos, isLoading, isError } = useQuery({
    queryKey: ["depositos"],
    queryFn: listarDepositos,
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando depósitos…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los depósitos.</p>;

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Warehouse size={20} className="text-pino" /> Depósitos del hotel
      </h2>
      <Table
        columnas={["Nombre", "Ubicación", "Responsable"]}
        filas={depositos}
        vacio="Todavía no hay depósitos cargados."
        renderFila={(d) => (
          <tr key={d.id} className="border-b border-borde last:border-0">
            <td className="px-3 py-2 font-semibold">{d.nombre}</td>
            <td className="px-3 py-2">{d.ubicacion}</td>
            <td className="px-3 py-2">{d.responsable}</td>
          </tr>
        )}
      />
    </div>
  );
}
