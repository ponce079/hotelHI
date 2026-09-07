import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

// Rediseño de la columna Acciones de Requerimientos: antes se listaban en
// línea todas las acciones posibles del estado (Editar, Anular, Solicitar
// presupuesto...), lo que dejaba cada fila con un ancho distinto y texto
// cortado contra el borde. Ahora solo la acción principal queda visible;
// el resto entra acá, así la columna mide siempre lo mismo sin importar
// cuántas acciones tenga cada estado.
export function MenuAcciones({ acciones }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    function alClickearFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickearFuera);
    return () => document.removeEventListener("mousedown", alClickearFuera);
  }, [abierto]);

  if (!acciones || acciones.length === 0) return null;

  return (
    <div className="relative" ref={contenedorRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Más acciones"
        className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-md text-piedra transition-colors hover:bg-hueso hover:text-tinta"
      >
        <MoreVertical size={16} />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded-md border border-borde bg-white py-1 shadow-[0_4px_12px_rgba(46,43,37,0.16)]">
          {acciones.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={() => {
                setAbierto(false);
                a.onClick();
              }}
              className={`block w-full cursor-pointer whitespace-nowrap px-3 py-1.5 text-left font-body text-[12.5px] transition-colors hover:bg-hueso disabled:cursor-not-allowed disabled:opacity-50 ${
                a.variante === "baja" ? "text-error-texto" : "text-tinta"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
