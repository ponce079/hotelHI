import { X } from "lucide-react";

// Mismo botón en todas las pantallas de listado con filtros (Proveedores,
// Requerimientos, Presupuestos, Órdenes de Compra) — una sola línea
// estética para "hay filtros aplicados, ofrecé limpiarlos".
export function LimpiarFiltros({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-error"
    >
      <X size={14} /> Limpiar filtros
    </button>
  );
}
