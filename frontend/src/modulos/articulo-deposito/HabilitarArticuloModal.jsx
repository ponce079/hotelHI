import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { habilitarArticuloEnDeposito, listarHabilitaciones } from "./articuloDeposito.api";
import { listarArticulos } from "../articulos/articulos.api";

// Habilita UN articulo en UN deposito puntual (HU-4, usado desde el
// detalle de deposito). El alta combinada de articulo+depositos multiples
// ya existe en ArticuloModal — esto es el camino inverso: parado en el
// deposito, elegis que articulo sumarle.
export function HabilitarArticuloModal({ depositoId, depositoNombre, onClose, onExito }) {
  const [articuloId, setArticuloId] = useState("");
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
  const disponibles = (articulos?.items ?? []).filter((a) => !yaHabilitadosIds.has(a.id));

  const mutacion = useMutation({
    mutationFn: () => habilitarArticuloEnDeposito({ articuloId: Number(articuloId), depositoIds: [depositoId] }),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ["articulo-depositos"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      const articulo = disponibles.find((a) => a.id === Number(articuloId));
      const resultado = resp.resultados?.[0];
      if (resultado?.estado === "ya_existia") {
        onExito(`${articulo?.nombre ?? "El artículo"} ya estaba habilitado en este depósito.`);
      } else {
        onExito(`${articulo?.nombre ?? "Artículo"} habilitado en este depósito.`);
      }
    },
    onError: (err) => {
      setError(err?.response?.data?.error ?? "No se pudo habilitar el artículo.");
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!articuloId) {
      setError("Elegí un artículo.");
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
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-borde px-6 py-5">
          <h3 className="font-heading text-[20px] font-semibold text-tinta">Habilitar artículo</h3>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-piedra hover:text-error">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 px-6 py-5">
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-tinta/70">Depósito</span>
              <div className="rounded-md border border-borde bg-hueso px-3 py-2 text-sm text-tinta">{depositoNombre}</div>
            </div>
            <Select
              label="Artículo *"
              value={articuloId}
              onChange={(e) => {
                setArticuloId(e.target.value);
                setError("");
              }}
            >
              <option value="">Seleccionar…</option>
              {disponibles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} · {a.nombre}
                </option>
              ))}
            </Select>
            <p className="text-xs text-piedra">
              El par artículo–depósito es único. Al habilitar se crea su fila de stock en 0.
            </p>
          </div>
          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
