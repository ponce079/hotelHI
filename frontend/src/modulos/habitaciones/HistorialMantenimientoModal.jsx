import { useQuery } from "@tanstack/react-query";
import { BellRing, Wrench } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Badge } from "../../componentes/Badge";
import { Table } from "../../componentes/Table";
import { formatearTimestamp } from "../../lib/fechas";
import { listarNotificacionesMantenimiento, listarOrdenesMantenimiento } from "./habitaciones.api";

export function HistorialMantenimientoModal({ onClose }) {
  const ordenes = useQuery({
    queryKey: ["ordenes-mantenimiento"],
    queryFn: () => listarOrdenesMantenimiento(),
  });
  const notificaciones = useQuery({
    queryKey: ["notificaciones-mantenimiento"],
    queryFn: () => listarNotificacionesMantenimiento(),
  });

  const cargando = ordenes.isLoading || notificaciones.isLoading;
  const conError = ordenes.isError || notificaciones.isError;

  return (
    <Modal titulo="Historial de mantenimiento" subtitulo="Órdenes e incidentes urgentes registrados" onClose={onClose} ancho="max-w-5xl">
      <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto px-6 py-5">
        {cargando && <p className="text-sm text-piedra">Cargando historial…</p>}
        {conError && <p className="text-sm text-error-texto">No se pudo cargar el historial completo.</p>}

        {!cargando && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Wrench size={18} className="text-pino" />
              <h4 className="font-body text-sm font-semibold text-tinta">Órdenes de mantenimiento</h4>
            </div>
            <div className="rounded-lg border border-borde bg-white p-4">
              <Table
                columnas={["Fecha", "Habitación", "Tipo", "Responsable", "Urgencia"]}
                filas={ordenes.data ?? []}
                vacio="Todavía no hay órdenes de mantenimiento."
                renderFila={(orden) => (
                  <tr key={orden.id} className="border-b border-borde last:border-0 hover:bg-hueso">
                    <td className="px-3 py-2 font-mono text-xs">{formatearTimestamp(orden.fecha)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{orden.habitacion?.numero ?? "—"}</td>
                    <td className="px-3 py-2 text-[13px]">{orden.tipoTarea}</td>
                    <td className="px-3 py-2 text-[13px]">{orden.responsable}</td>
                    <td className="px-3 py-2">
                      {orden.notificaciones?.length ? <Badge variante="error">Urgente</Badge> : <Badge variante="neutro">Normal</Badge>}
                    </td>
                  </tr>
                )}
              />
            </div>
          </section>
        )}

        {!cargando && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <BellRing size={18} className="text-error" />
              <h4 className="font-body text-sm font-semibold text-tinta">Notificaciones urgentes enviadas</h4>
            </div>
            <div className="rounded-lg border border-borde bg-white p-4">
              <Table
                columnas={["Fecha", "Habitación", "Destino", "Canal", "Mensaje"]}
                filas={notificaciones.data ?? []}
                vacio="Todavía no hay notificaciones de mantenimiento."
                renderFila={(notificacion) => (
                  <tr key={notificacion.id} className="border-b border-borde last:border-0 hover:bg-hueso">
                    <td className="px-3 py-2 font-mono text-xs">{formatearTimestamp(notificacion.fechaEnvio)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{notificacion.habitacion?.numero ?? "—"}</td>
                    <td className="px-3 py-2 text-[13px]">{notificacion.destinatarioArea}</td>
                    <td className="px-3 py-2"><Badge variante="alerta">{notificacion.canal}</Badge></td>
                    <td className="max-w-sm px-3 py-2 text-xs text-piedra">{notificacion.mensaje || "Sin detalle"}</td>
                  </tr>
                )}
              />
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
