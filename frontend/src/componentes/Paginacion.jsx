import { ChevronLeft, ChevronRight } from "lucide-react";

// Paginación de listados con paginación de servidor.
//
// Uso:
//   <Paginacion pagina={2} paginas={5} total={203} tamano={50} onCambiar={(n) => ...} nombre="reservas" />
// A la izquierda "Mostrando 51–100 de 203"; a la derecha ‹ 1 2 3 … 5 › con la página actual en pino lleno (los
// controles solo aparecen si hay más de una página). Es un <nav> con botones reales. El `Pagination` viejo
// (Anterior / Siguiente) sigue existiendo para las pantallas que todavía no migraron.

// Páginas a mostrar: siempre la primera, la última y las vecinas de la actual; null = "…".
export function paginasVisibles(pagina, paginas) {
  const conjunto = new Set([1, paginas, pagina - 1, pagina, pagina + 1]);
  const orden = [...conjunto].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b);
  const salida = [];
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1] > 1) salida.push(null);
    salida.push(n);
  });
  return salida;
}

const BOTON =
  "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border border-transparent px-2 text-[13px] font-semibold text-tinta hover:bg-hueso disabled:cursor-not-allowed disabled:opacity-40";

export function Paginacion({ pagina, paginas, total, tamano, onCambiar, nombre = "resultados" }) {
  if (!total) return null;
  const desde = (pagina - 1) * tamano + 1;
  const hasta = Math.min(total, pagina * tamano);
  return (
    <nav
      aria-label={`Paginación de ${nombre}`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--divisor-fila)] px-5 py-3.5 text-[13px] text-piedra"
    >
      <span>
        Mostrando {desde}–{hasta} de {total}
      </span>
      {paginas > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={BOTON} disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)} aria-label="Página anterior">
            <ChevronLeft size={16} strokeWidth={1.6} />
          </button>
          {paginasVisibles(pagina, paginas).map((n, i) =>
            n === null ? (
              <span key={`p${i}`} aria-hidden="true" className="px-1">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                aria-label={`Página ${n}`}
                aria-current={n === pagina ? "page" : undefined}
                className={`${BOTON} ${n === pagina ? "!bg-pino !text-[var(--on-color)]" : ""}`}
                onClick={() => n !== pagina && onCambiar(n)}
              >
                {n}
              </button>
            ),
          )}
          <button type="button" className={BOTON} disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)} aria-label="Página siguiente">
            <ChevronRight size={16} strokeWidth={1.6} />
          </button>
        </div>
      )}
    </nav>
  );
}
