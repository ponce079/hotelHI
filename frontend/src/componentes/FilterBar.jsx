import { LimpiarFiltros } from "./LimpiarFiltros";

// Barra de filtros. Props de siempre: `children` y `onClear` (agrega "Limpiar filtros" a la derecha).
// Opcionales del rediseño:
//  - `incrustada`: sin borde ni radio propios, para ir DENTRO de una tarjeta (sobre las pestañas y arriba de la
//    tabla): queda como banda `--banda-filtros` con un divisor inferior.
//  - `ocultarLimpiar`: no dibuja el botón (si la pantalla pone su propio "Limpiar filtros" en `children`).
export function FilterBar({ children, onClear, incrustada = false, ocultarLimpiar = false, className = "" }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 bg-[var(--banda-filtros)] p-3 ${
        incrustada ? "border-b border-[var(--divisor-fila)]" : "rounded-lg border border-borde"
      } ${className}`}
    >
      {children}
      {onClear && !ocultarLimpiar && (
        <div className="ml-auto">
          <LimpiarFiltros onClick={onClear} />
        </div>
      )}
    </div>
  );
}
