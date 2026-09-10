import { useQuery } from "@tanstack/react-query";
import { X, Pencil } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { consultarStock } from "../stock/stock.api";
import { UNIDADES_MEDIDA_NOMBRES } from "./articulos.constantes";

export function ArticuloDetalleModal({ articulo, onClose, onEditar }) {
  const { data: filas, isLoading } = useQuery({
    queryKey: ["stock", { articuloId: String(articulo.id) }],
    queryFn: () => consultarStock({ articuloId: articulo.id }),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-tinta/45 p-6 py-10" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-borde px-6 py-5">
          <div>
            <span className="block font-mono text-xs text-piedra">{articulo.codigo}</span>
            <h3 className="font-heading text-lg font-bold text-pino-oscuro">{articulo.nombre}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-hueso px-2.5 py-0.5 text-xs text-piedra">{articulo.categoria}</span>
              <span className="rounded-full bg-hueso px-2.5 py-0.5 text-xs text-piedra">
                {UNIDADES_MEDIDA_NOMBRES[articulo.unidadMedida] ?? articulo.unidadMedida}
              </span>
              <Badge variante={articulo.activo ? "ok" : "neutro"}>{articulo.activo ? "Habilitado" : "Deshabilitado"}</Badge>
            </div>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-piedra hover:text-error">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          {isLoading && <p className="text-sm text-piedra">Cargando…</p>}
          {!isLoading && (
            <>
              <p className="mb-3 text-sm text-tinta">
                Habilitado en <span className="font-heading text-lg font-bold text-pino-oscuro">{filas?.length ?? 0}</span>{" "}
                {filas?.length === 1 ? "depósito" : "depósitos"}
              </p>
              {(!filas || filas.length === 0) ? (
                <p className="rounded-md bg-hueso px-4 py-3 text-center text-sm text-piedra">
                  Todavía no está habilitado en ningún depósito.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-borde px-2 pb-2 text-left text-xs font-bold uppercase tracking-wide text-piedra">Depósito</th>
                      <th className="border-b border-borde px-2 pb-2 text-right text-xs font-bold uppercase tracking-wide text-piedra">Stock actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.depositoId} className="border-b border-borde last:border-0">
                        <td className="px-2 py-2">{f.deposito}</td>
                        <td className="px-2 py-2 text-right font-mono font-semibold">{f.stockActual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-borde px-6 py-4">
          <span className="text-xs text-piedra">El stock solo cambia con Movimientos de Stock.</span>
          {/* Única acción del footer (auditoría de botones, P2.1) — primario. */}
          <Button variante="ok" onClick={onEditar} icono={Pencil}>Editar artículo</Button>
        </div>
      </div>
    </div>
  );
}
