import { useEffect } from "react";

// Título de la pestaña de cada página del e-commerce: "<página> · Holiday Inn
// Salta". Al salir de la página se restaura el título anterior.
export const SUFIJO_TITULO = "Holiday Inn Salta";

export function useTituloPagina(nombre) {
  useEffect(() => {
    const anterior = document.title;
    document.title = nombre ? `${nombre} · ${SUFIJO_TITULO}` : SUFIJO_TITULO;
    return () => {
      document.title = anterior;
    };
  }, [nombre]);
}
