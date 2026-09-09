import { LimpiarFiltros } from "./LimpiarFiltros";

export function FilterBar({ children, onClear }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-borde bg-white p-3">
      {children}
      {onClear && (
        <div className="ml-auto">
          <LimpiarFiltros onClick={onClear} />
        </div>
      )}
    </div>
  );
}
