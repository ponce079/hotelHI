import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { formatearTimestamp } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { listarOrdenesMantenimiento } from "./habitaciones.api";
import { ESTADO_ORDEN_MANTENIMIENTO_BADGE } from "./habitaciones.constantes";

// Mismo permiso que el Panel de Habitaciones (verHabitaciones: admin,
// recepcionista, housekeeping) — es la misma audiencia, ahora en su propia
// entrada de menú en vez de un botón "Historial" en el header del Panel.
export function HistorialMantenimientoPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verHabitaciones");

  const ordenes = useQuery({
    queryKey: ["ordenes-mantenimiento"],
    queryFn: () => listarOrdenesMantenimiento(),
    enabled: puedeVer,
  });

  if (!puedeVer) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Historial de Mantenimiento</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          Órdenes registradas en todas las habitaciones
        </p>
      </div>

      {ordenes.isLoading && <p className="text-sm text-piedra">Cargando historial…</p>}
      {ordenes.isError && <p className="text-sm text-error-texto">No se pudo cargar el historial.</p>}

      {!ordenes.isLoading && !ordenes.isError && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
            <Wrench size={17} className="text-pino" /> Órdenes de mantenimiento
          </h2>
          <Table
            columnas={["Fecha", "Habitación", "Tipo", "Responsable", "Prioridad", "Estado"]}
            filas={ordenes.data ?? []}
            vacio="Todavía no hay órdenes de mantenimiento."
            renderFila={(orden) => (
              <tr key={orden.id} className="border-b border-borde last:border-0 hover:bg-hueso">
                <td className="px-3 py-2.5 font-mono text-xs">{formatearTimestamp(orden.fecha)}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{orden.habitacion?.numero ?? "—"}</td>
                <td className="px-3 py-2.5 text-[13px]">{orden.tipoTarea}</td>
                <td className="px-3 py-2.5 text-[13px]">{orden.responsable}</td>
                <td className="px-3 py-2.5">
                  {orden.urgente ? <Badge variante="error">Urgente</Badge> : <Badge variante="neutro">Normal</Badge>}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variante={ESTADO_ORDEN_MANTENIMIENTO_BADGE[orden.estado] ?? "neutro"}>{orden.estado}</Badge>
                </td>
              </tr>
            )}
          />
        </div>
      )}
    </div>
  );
}
