import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { CodigoClave } from "../../componentes/CodigoClave";
import { Table } from "../../componentes/Table";
import { formatearPrecio } from "../../lib/moneda";
import { listarGarantiasARevisar } from "./checkOut.api";

// Aviso del listado de check-out: garantías que no se pudieron cerrar al confirmar (estado "Revisión manual").
// No se muestra nada si no hay ninguna (ni mientras carga o si la consulta falla).
export function GarantiasARevisar({ habilitado }) {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const { data } = useQuery({
    queryKey: ["check-out", "garantias-a-revisar"],
    queryFn: listarGarantiasARevisar,
    enabled: habilitado,
  });
  const garantias = data ?? [];
  if (garantias.length === 0) return null;

  return (
    <div className="rounded-lg border border-laton-300 bg-laton-100 p-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full cursor-pointer items-center gap-2 text-left text-[13.5px] font-medium text-laton-700"
      >
        {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {garantias.length === 1 ? "1 garantía sin cerrar" : `${garantias.length} garantías sin cerrar`} · revisalas
      </button>
      {abierto && (
        <div className="mt-3 rounded-md border border-borde bg-white p-2">
          <Table
            columnas={["Reserva", "Huésped", "Tipo", "Monto", "Motivo"]}
            filas={garantias}
            renderFila={(g) => (
              <tr
                key={g.reservaId}
                onClick={() => navigate(`/reservas/${g.reservaId}`)}
                className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
              >
                <td className="px-3 py-2.5">
                  <CodigoClave>{g.codigoConfirmacion}</CodigoClave>
                </td>
                <td className="px-3 py-2.5 text-[13px]">{g.huesped ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <Badge variante="alerta">{g.tipo === "PREAUTORIZACION" ? "Preautorización" : "Depósito"}</Badge>
                </td>
                <td className="px-3 py-2.5 font-mono text-[13px]">{formatearPrecio(g.montoRestante)}</td>
                <td className="px-3 py-2.5 text-[12.5px] text-piedra">{g.mensaje ?? "—"}</td>
              </tr>
            )}
          />
        </div>
      )}
    </div>
  );
}
