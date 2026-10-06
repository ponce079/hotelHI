import { useEffect, useRef } from "react";

// Overlays abiertos que escuchan Esc. Con Esc se cierra solo el que está
// visualmente arriba (ej. un ConfirmDialog sobre un Modal), no todos a la vez.
const abiertos = new Set();

function zIndex(elemento) {
  return Number.parseInt(getComputedStyle(elemento).zIndex, 10) || 0;
}

// Mayor z-index; si empatan, el último en el documento (un overlay anidado
// dentro de otro queda después de él). No se decide por orden de apertura:
// un padre y un hijo que se montan juntos registran sus efectos hijo primero.
function deArriba() {
  return [...abiertos]
    .filter((a) => a.ref.current)
    .reduce((arriba, a) => {
      if (!arriba) return a;
      const za = zIndex(a.ref.current);
      const zArriba = zIndex(arriba.ref.current);
      if (za !== zArriba) return za > zArriba ? a : arriba;
      return arriba.ref.current.compareDocumentPosition(a.ref.current) & Node.DOCUMENT_POSITION_FOLLOWING ? a : arriba;
    }, null);
}

// Cierra el overlay con la tecla Esc mientras `activo` sea true. Devuelve la
// ref que va en el elemento del overlay (el fondo oscuro). `onCerrar` puede
// cambiar en cada render sin volver a registrar el listener.
export function useCerrarConEsc(activo, onCerrar) {
  const ref = useRef(null);
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (!activo) return;
    const entrada = { ref };
    abiertos.add(entrada);
    function alApretarTecla(e) {
      if (e.key !== "Escape" || e.defaultPrevented || deArriba() !== entrada) return;
      e.preventDefault();
      onCerrarRef.current?.();
    }
    document.addEventListener("keydown", alApretarTecla);
    return () => {
      document.removeEventListener("keydown", alApretarTecla);
      abiertos.delete(entrada);
    };
  }, [activo]);

  return ref;
}
