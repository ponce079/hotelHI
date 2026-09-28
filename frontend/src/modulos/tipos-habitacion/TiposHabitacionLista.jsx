import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RotateCw, Tag, Trash2 } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { listarTiposHabitacion, cambiarActivoTipoHabitacion } from "./tiposHabitacion.api";
import { useToast } from "../../lib/useToast";

// El ABM necesita ver TODOS los tipos (activos e inactivos, para poder
// reactivar) — a diferencia de los selects de filtro/alta, que solo piden
// activo=true.
export function TiposHabitacionLista({ puedeGestionar, onEditar }) {
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();
  const [cambioActivo, setCambioActivo] = useState(null);

  const { data: tipos, isLoading, isError } = useQuery({
    queryKey: ["tipos-habitacion", "todos"],
    queryFn: () => listarTiposHabitacion({ activo: "todos" }),
  });

  const mutacionActivo = useMutation({
    mutationFn: ({ id, valor }) => cambiarActivoTipoHabitacion(id, valor),
    onSuccess: (actualizado) => {
      queryClient.invalidateQueries({ queryKey: ["tipos-habitacion"] });
      mostrarToast(`Tipo "${actualizado.nombre}" ${actualizado.activo ? "reactivado" : "dado de baja"}.`);
      setCambioActivo(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar la vigencia del tipo.");
      setCambioActivo(null);
    },
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando tipos de habitación…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los tipos de habitación.</p>;

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold">
        <Tag size={20} className="text-pino" /> Catálogo de tipos de habitación
      </h2>
      <Table
        columnas={["Código", "Nombre", "Descripción", "Estado", puedeGestionar ? "Acciones" : null].filter(Boolean)}
        columnasDerecha={puedeGestionar ? ["Acciones"] : []}
        filas={tipos}
        vacio="Todavía no hay tipos de habitación cargados."
        renderFila={(t) => (
          <tr key={t.id} className="border-b border-borde last:border-0">
            <td className="px-3 py-2 font-mono text-[12.5px]">{t.codigo}</td>
            <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{t.nombre}</td>
            <td className="px-3 py-2 text-[12.5px] text-tinta/60">{t.descripcion || "—"}</td>
            <td className="px-3 py-2">
              <Badge variante={t.activo ? "ok" : "neutro"}>{t.activo ? "Activo" : "Dado de baja"}</Badge>
            </td>
            {puedeGestionar && (
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-2">
                  <Button variante="secundario" tamano="fila" onClick={() => onEditar(t)} icono={Pencil}>
                    Editar
                  </Button>
                  <Button
                    variante={t.activo ? "destructivo" : undefined}
                    tamano="fila"
                    onClick={() => setCambioActivo(t)}
                    icono={t.activo ? Trash2 : RotateCw}
                  >
                    {t.activo ? "Dar de baja" : "Reactivar"}
                  </Button>
                </div>
              </td>
            )}
          </tr>
        )}
      />

      <ConfirmDialog
        abierto={Boolean(cambioActivo)}
        titulo={cambioActivo?.activo ? "¿Dar de baja el tipo de habitación?" : "¿Reactivar el tipo de habitación?"}
        mensaje={
          cambioActivo?.activo
            ? `"${cambioActivo?.nombre}" dejará de poder elegirse al crear/editar habitaciones. Si tiene habitaciones activas asociadas, la baja se va a rechazar.`
            : `"${cambioActivo?.nombre}" vuelve a estar disponible para elegir en habitaciones.`
        }
        textoConfirmar={cambioActivo?.activo ? "Sí, dar de baja" : "Sí, reactivar"}
        variante={cambioActivo?.activo ? "destructivo" : "alta"}
        icono={cambioActivo?.activo ? Trash2 : RotateCw}
        onCancelar={() => setCambioActivo(null)}
        onConfirmar={() => mutacionActivo.mutate({ id: cambioActivo.id, valor: !cambioActivo.activo })}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
