import { X } from "lucide-react";

export function FilterBar({ children, onClear }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-borde bg-white p-3">
      {children}
      {onClear && (
        <button
          onClick={onClear}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-error"
        >
          <X size={14} /> Limpiar filtros
        </button>
      )}
    </div>
  );
}
