import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

// Rediseño de la columna Acciones de Requerimientos: antes se listaban en
// línea todas las acciones posibles del estado (Editar, Anular, Solicitar
// presupuesto...), lo que dejaba cada fila con un ancho distinto y texto
// cortado contra el borde. Ahora solo la acción principal queda visible;
// el resto entra acá, así la columna mide siempre lo mismo sin importar
// cuántas acciones tenga cada estado.
export function MenuAcciones({ acciones }) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const contenedorRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    function alClickearFuera(e) {
      const fueraDelBoton = contenedorRef.current && !contenedorRef.current.contains(e.target);
      const fueraDelMenu = menuRef.current && !menuRef.current.contains(e.target);
      if (fueraDelBoton && fueraDelMenu) setAbierto(false);
    }
    function cerrarAlMoverVista() {
      setAbierto(false);
    }
    document.addEventListener("mousedown", alClickearFuera);
    window.addEventListener("resize", cerrarAlMoverVista);
    window.addEventListener("scroll", cerrarAlMoverVista, true);
    return () => {
      document.removeEventListener("mousedown", alClickearFuera);
      window.removeEventListener("resize", cerrarAlMoverVista);
      window.removeEventListener("scroll", cerrarAlMoverVista, true);
    };
  }, [abierto]);

  if (!acciones || acciones.length === 0) return null;

  return (
    <div className="relative" ref={contenedorRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          if (!abierto) {
            const rect = contenedorRef.current.getBoundingClientRect();
            setPosicion({
              right: Math.max(8, window.innerWidth - rect.right),
              bottom: Math.max(8, window.innerHeight - rect.top + 4),
            });
          }
          setAbierto((v) => !v);
        }}
        aria-label="Más acciones"
        className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-md text-piedra transition-colors hover:bg-hueso hover:text-tinta"
      >
        <MoreVertical size={16} />
      </button>
      {abierto && posicion && createPortal(
        <div
          ref={menuRef}
          style={{ right: posicion.right, bottom: posicion.bottom }}
          className="fixed z-[100] min-w-[190px] rounded-md border border-borde bg-white py-1 shadow-[0_8px_24px_rgba(46,43,37,0.22)]"
        >
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
                a.variante === "destructivo" ? "text-error-texto" : "text-tinta"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
