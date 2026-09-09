import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { listarTiposMovimiento, cambiarEstadoTipoMovimiento } from "./tiposMovimiento.api";
import { TIPOS_NOMBRES } from "./tiposMovimiento.constantes";
import { useToast } from "../../lib/useToast";

const VARIANTE_POR_TIPO = { E: "ok", S: "alerta" };

export function TiposMovimientoLista() {
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();
  const [paraDeshabilitar, setParaDeshabilitar] = useState(null);

  const { data: tipos, isLoading, isError } = useQuery({
    queryKey: ["tipos-movimiento"],
    queryFn: listarTiposMovimiento,
  });

  const mutacion = useMutation({
    mutationFn: (id) => cambiarEstadoTipoMovimiento(id, false),
    onSuccess: (tipo) => {
      queryClient.invalidateQueries({ queryKey: ["tipos-movimiento"] });
      mostrarToast(`"${tipo.descripcion}" deshabilitado.`);
      setParaDeshabilitar(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo deshabilitar el tipo de movimiento.");
      setParaDeshabilitar(null);
    },
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando tipos de movimiento…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los tipos de movimiento.</p>;

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold">
        <ArrowRightLeft size={20} className="text-pino" /> Tipos de movimiento de stock
      </h2>
      <Table
        columnas={["Descripción", "Tipo", "Uso", "Acciones"]}
        columnasDerecha={["Acciones"]}
        filas={tipos}
        vacio="Todavía no hay tipos de movimiento cargados."
        renderFila={(t) => (
          <tr key={t.id} className="border-b border-borde last:border-0">
            <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{t.descripcion}</td>
            <td className="px-3 py-2">
              <Badge variante={VARIANTE_POR_TIPO[t.tipo]}>{TIPOS_NOMBRES[t.tipo] ?? t.tipo}</Badge>
            </td>
            <td className="px-3 py-2 text-[12.5px] text-tinta/60">
              {t.contexto === "TRANSFERENCIA" ? "Automático (Transferencia/Recepción)" : "Elegible en Entrada/Salida"}
            </td>
            <td className="px-3 py-2 text-right">
              {t.contexto === "TRANSFERENCIA" ? (
                <span className="text-xs text-piedra">No se puede deshabilitar</span>
              ) : (
                <Button variante="destructivo" tamano="fila" onClick={() => setParaDeshabilitar(t)}>
                  Deshabilitar
                </Button>
              )}
            </td>
          </tr>
        )}
      />

      <ConfirmDialog
        abierto={Boolean(paraDeshabilitar)}
        titulo="¿Deshabilitar tipo de movimiento?"
        mensaje={`"${paraDeshabilitar?.descripcion}" desaparecerá de esta lista y de los movimientos de Entrada/Salida. No se borra: conserva su historial y podés reactivarlo desde la base si hace falta.`}
        textoConfirmar="Sí, deshabilitar"
        variante="destructivo"
        onCancelar={() => setParaDeshabilitar(null)}
        onConfirmar={() => mutacion.mutate(paraDeshabilitar.id)}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
