import { useEffect, useRef } from "react";

// Los elementos con la clase "ec-revelar" dentro del contenedor aparecen suavemente al
// entrar en pantalla (rediseño "Holiday Inn Salta"). Sin IntersectionObserver (tests) o con
// "reducir movimiento" se muestran de una. Devuelve la ref del contenedor.
export function useRevelar() {
  const ref = useRef(null);
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return undefined;
    const elementos = raiz.querySelectorAll(".ec-revelar:not(.ec-revelar--visible)");
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (typeof IntersectionObserver === "undefined" || sinMovimiento) {
      elementos.forEach((el) => el.classList.add("ec-revelar--visible"));
      return undefined;
    }
    const observador = new IntersectionObserver(
      (entradas) =>
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("ec-revelar--visible");
            observador.unobserve(entrada.target);
          }
        }),
      { threshold: 0.1 },
    );
    elementos.forEach((el) => observador.observe(el));
    return () => observador.disconnect();
  });
  return ref;
}
