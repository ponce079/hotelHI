import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-borde pt-3">
      <button
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-piedra hover:bg-hueso disabled:cursor-not-allowed disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} /> Anterior
      </button>
      <span className="text-sm text-piedra">
        Página {page} de {totalPages}
      </span>
      <button
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-piedra hover:bg-hueso disabled:cursor-not-allowed disabled:opacity-40"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Siguiente <ChevronRight size={16} />
      </button>
    </div>
  );
}
