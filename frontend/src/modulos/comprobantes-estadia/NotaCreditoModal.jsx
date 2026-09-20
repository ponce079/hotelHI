import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, X } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Modal } from "../../componentes/Modal";
import { MoneyInput } from "../../componentes/MoneyInput";
import { formatearMonto } from "../../lib/moneda";
import { crearNotaCredito } from "./comprobanteEstadia.api";
import { desglosarTotalConIva, MOTIVO_NOTA_CREDITO_MAX_LENGTH } from "./comprobanteEstadia.constantes";

const moneda = (n) => `$ ${formatearMonto(n)}`;

// Comparar en centavos (enteros), como el backend.
const centavos = (n) => Math.round(Number(n || 0) * 100);

// HU-56 — nota de crédito sobre un comprobante emitido. El importe se carga
// como total (IVA incluido) y se limita a lo que TODAVÍA se puede acreditar
// del original: el backend vuelve a validarlo, esto solo evita ir y volver.
// La alícuota es la del comprobante original (una nota de crédito no cambia
// el IVA de lo que corrige).
export function NotaCreditoModal({ comprobante, disponible, onClose, onExito }) {
  const queryClient = useQueryClient();
  const [importe, setImporte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  const alicuota = Number(comprobante.alicuotaIVA);
  const total = Number(importe) > 0 ? Number(importe) : 0;
  const desglose = desglosarTotalConIva(total, alicuota);
  const excede = centavos(total) > centavos(disponible);

  const mutacion = useMutation({
    mutationFn: () => crearNotaCredito(comprobante.id, { importeTotal: total, alicuotaIVA: alicuota, motivo: motivo.trim() }),
    onSuccess: (nota) => {
      queryClient.invalidateQueries({ queryKey: ["comprobantes-estadia"] });
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      onExito(nota);
    },
    onError: (err) => {
      setError(err?.response?.data?.error ?? "No se pudo emitir la nota de crédito.");
    },
  });

  function emitir() {
    if (!(total > 0)) return setError("Ingresá el importe a acreditar.");
    if (excede) return setError(`El importe supera lo que todavía se puede acreditar (${moneda(disponible)}).`);
    if (!motivo.trim()) return setError("El motivo es obligatorio: queda como respaldo de la nota.");
    setError("");
    mutacion.mutate();
  }

  return (
    <Modal
      titulo="Emitir nota de crédito"
      subtitulo={`HU 56 — sobre el comprobante ${comprobante.numero}`}
      onClose={mutacion.isPending ? () => {} : onClose}
    >
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-borde bg-hueso px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-piedra">Total del comprobante</p>
            <p className="font-mono text-[13.5px]">{moneda(comprobante.importeTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-piedra">Todavía acreditable</p>
            <p className="font-mono text-[13.5px] font-semibold text-pino">{moneda(disponible)}</p>
          </div>
        </div>

        <div className="w-55">
          <MoneyInput label="Importe a acreditar (IVA incluido) *" value={importe} onChange={setImporte} />
        </div>

        <div className="flex flex-wrap items-end gap-6 rounded-lg border border-borde bg-white px-5 py-4">
          <div className="flex min-w-50 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-6 text-[12.5px] text-piedra">
              <span>Importe neto</span>
              <span className="font-mono text-[13px] text-tinta">{moneda(desglose.neto)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-6 text-[12.5px] text-piedra">
              <span>IVA {String(alicuota).replace(".", ",")} % (el del original)</span>
              <span className="font-mono text-[13px] text-tinta">{moneda(desglose.iva)}</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-piedra">Total a acreditar</p>
            <Cifra tamano={26} className={excede ? "text-error-texto" : ""}>
              {moneda(desglose.total)}
            </Cifra>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 font-body text-sm">
          <span className="text-[12px] text-tinta/70">Motivo *</span>
          <textarea
            rows={3}
            value={motivo}
            maxLength={MOTIVO_NOTA_CREDITO_MAX_LENGTH}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descuento otorgado por una queja, error de facturación, servicio no prestado…"
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </label>

        {error && (
          <div className="rounded-md bg-error-suave px-4 py-3">
            <p className="text-[12.5px] text-error-texto">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-borde pt-4">
          <Button variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button variante="ok" icono={FilePlus2} cargando={mutacion.isPending} onClick={emitir}>
            {mutacion.isPending ? "Emitiendo…" : "Emitir nota de crédito"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
