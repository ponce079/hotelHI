import { X } from "lucide-react";

// Overlay generico para altas/ediciones en modal (mismo look que ya usan
// DepositoModal/ProveedorModal/ArticuloModal, pero factorizado para no
// triplicarlo en los modales nuevos de Sprint 2 — Comprobantes y Pagos).
// `ancho` es una clase max-w-* de Tailwind: los formularios simples usan
// el default, los flujos con tablas/pasos (ej. el wizard de orden de pago)
// pasan uno mas grande.
// `subtitulo` y `extra` son opcionales (default undefined, no cambian
// ningún modal existente): un renglón de contexto bajo el título y un
// elemento libre (ej. un badge de transición de estado) antes del botón
// de cerrar — pensado para SolicitarPresupuestosModal, pero cualquier
// modal puede usarlos.
export function Modal({ titulo, subtitulo, extra, onClose, children, ancho = "max-w-lg" }) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-tinta/45 p-6 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${ancho} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-borde px-6 py-5">
          <div className="min-w-0">
            <h3 className="font-heading text-[20px] font-semibold text-tinta">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 text-[12.5px] text-tinta/60">{subtitulo}</p>}
          </div>
          <div className="flex flex-none items-center gap-3">
            {extra}
            <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-piedra hover:text-error">
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
