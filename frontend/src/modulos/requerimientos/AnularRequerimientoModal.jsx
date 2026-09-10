import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../componentes/Modal";
import { Button } from "../../componentes/Button";
import { X, Ban } from "lucide-react";
import { anularRequerimiento } from "./requerimientos.api";

// Baja lógica con motivo obligatorio — mismo criterio que anular una OC
// (OrdenCompraDetallePage), solo que acá vive en un modal porque se
// dispara desde la fila de un listado, no desde una ficha completa.
export function AnularRequerimientoModal({ requerimiento, onClose, onExito }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => anularRequerimiento(requerimiento.id, motivo.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(requerimiento.id)] });
      onExito(`Requerimiento REQ-${String(requerimiento.id).padStart(4, "0")} anulado.`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudo anular el requerimiento."),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!motivo.trim()) return setError("El motivo de anulación es obligatorio.");
    mutacion.mutate();
  }

  return (
    <Modal titulo="Anular requerimiento" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3.5 px-6 py-5">
          <p className="-mt-1 font-mono text-[11px] text-tinta/55">
            REQ-{String(requerimiento.id).padStart(4, "0")} · {requerimiento.deposito?.nombre}
          </p>
          <p className="text-[13px] text-tinta">
            Se anula este requerimiento y deja de poder solicitársele presupuestos. No se puede deshacer.
          </p>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-tinta/70">Motivo de anulación *</span>
            <textarea
              className={`rounded-md border bg-white px-3 py-2 text-[13px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40 ${
                error ? "border-error" : "border-borde"
              }`}
              rows={3}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError("");
              }}
              placeholder="ej. Se canceló la necesidad de reposición"
            />
            {error && <span className="text-[11.5px] text-error-texto">{error}</span>}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" onClick={onClose} icono={X}>Cancelar</Button>
          <Button type="submit" variante="destructivo" disabled={mutacion.isPending} icono={Ban}>
            {mutacion.isPending ? "Anulando…" : "Anular requerimiento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
