import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Search } from "lucide-react";
import { Button } from "../../componentes/Button";
import { habilitarArticuloEnDeposito, listarHabilitaciones } from "./articuloDeposito.api";
import { listarArticulos } from "../articulos/articulos.api";

// Habilita uno o VARIOS articulos en UN deposito puntual (HU-4, usado desde
// el detalle de deposito). El alta combinada de articulo+depositos multiples
// ya existe en ArticuloModal — esto es el camino inverso: parado en el
// deposito, elegis que articulos sumarle (con checkboxes, no de a uno).
export function HabilitarArticuloModal({ depositoId, depositoNombre, onClose, onExito }) {
  const [articuloIds, setArticuloIds] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data: articulos } = useQuery({
    queryKey: ["articulos", { estado: "activo", pageSize: 500 }],
    queryFn: () => listarArticulos({ estado: "activo", pageSize: 500 }),
  });
  const { data: habilitaciones } = useQuery({ queryKey: ["articulo-depositos"], queryFn: listarHabilitaciones });

  const yaHabilitadosIds = new Set(
    (habilitaciones ?? []).filter((h) => h.depositoId === depositoId && h.activo).map((h) => h.articuloId)
  );
  const f = filtro.trim().toLowerCase();
  const disponibles = (articulos?.items ?? [])
    .filter((a) => !yaHabilitadosIds.has(a.id))
    .filter((a) => !f || a.nombre.toLowerCase().includes(f) || a.codigo?.toLowerCase().includes(f));

  function toggleArticulo(id) {
    setArticuloIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setError("");
  }

  const mutacion = useMutation({
    mutationFn: () =>
      Promise.all(articuloIds.map((articuloId) => habilitarArticuloEnDeposito({ articuloId, depositoIds: [depositoId] }))),
    onSuccess: (respuestas) => {
      queryClient.invalidateQueries({ queryKey: ["articulo-depositos"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      const nombrePorId = new Map((articulos?.items ?? []).map((a) => [a.id, a.nombre]));
      const nuevas = respuestas.filter((r) => r.resultados?.[0]?.estado !== "ya_existia").length;
      const yaExistian = respuestas.length - nuevas;

      if (respuestas.length === 1) {
        const nombre = nombrePorId.get(articuloIds[0]) ?? "El artículo";
        onExito(yaExistian === 1 ? `${nombre} ya estaba habilitado en este depósito.` : `${nombre} habilitado en este depósito.`);
        return;
      }
      const partes = [];
      if (nuevas > 0) partes.push(`${nuevas} artículo${nuevas === 1 ? "" : "s"} habilitado${nuevas === 1 ? "" : "s"}`);
      if (yaExistian > 0) partes.push(`${yaExistian} ya lo estaba${yaExistian === 1 ? "" : "n"}`);
      onExito(`${partes.join(", ")} en este depósito.`);
    },
    onError: (err) => {
      setError(err?.response?.data?.error ?? "No se pudieron habilitar los artículos.");
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (articuloIds.length === 0) {
      setError("Elegí al menos un artículo.");
      return;
    }
    mutacion.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-tinta/45 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-borde px-6 py-5">
          <h3 className="font-heading text-[20px] font-semibold text-tinta">Habilitar artículos</h3>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-piedra hover:text-error">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 px-6 py-5">
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-tinta/70">Depósito</span>
              <div className="rounded-md border border-borde bg-hueso px-3 py-2 text-sm text-tinta">{depositoNombre}</div>
            </div>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="w-full rounded-md border border-borde py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-borde px-6 py-3">
            {disponibles.length === 0 && (
              <p className="py-4 text-center text-sm text-piedra">No hay artículos disponibles para habilitar.</p>
            )}
            <div className="flex flex-col gap-0.5">
              {disponibles.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-hueso">
                  <input
                    type="checkbox"
                    checked={articuloIds.includes(a.id)}
                    onChange={() => toggleArticulo(a.id)}
                    className="h-4 w-4 cursor-pointer accent-pino"
                  />
                  <span className="font-mono text-xs text-tinta/55">{a.codigo}</span>
                  <span className="text-tinta">{a.nombre}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-borde px-6 py-4">
            <span className="text-xs text-piedra">
              {articuloIds.length} seleccionado{articuloIds.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2.5">
              <Button type="button" variante="secundario" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutacion.isPending}>
                {mutacion.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
