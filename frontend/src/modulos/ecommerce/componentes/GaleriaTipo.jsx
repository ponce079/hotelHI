import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { FotoEjemplo } from "./FotoEjemplo";
import { imagenesDeTipo } from "../ecommerce.contenido";

// Galería del detalle del tipo (etapa 2): foto principal + 4 en escritorio;
// en móvil, solo la principal con el contador "1/5" superpuesto. "Ver las N
// fotos" abre una vista ampliada accesible: diálogo modal con foco inicial en
// "Cerrar", flechas ← → (y botones) para recorrer, Esc para cerrar y el foco
// vuelve al botón que la abrió. Las fotos son las del rediseño (imagenesDeTipo).
export function GaleriaTipo({ fotos, nombreTipo }) {
  const lista = fotos.length > 0 ? fotos : ["Foto · Habitación"];
  const [abierta, setAbierta] = useState(false);
  const [actual, setActual] = useState(0);
  const botonAbrir = useRef(null);
  const botonCerrar = useRef(null);
  const total = lista.length;

  function abrir(indice = 0) {
    setActual(indice);
    setAbierta(true);
  }

  function cerrar() {
    setAbierta(false);
    botonAbrir.current?.focus();
  }

  const mover = (paso) => setActual((i) => (i + paso + total) % total);

  useEffect(() => {
    if (abierta) botonCerrar.current?.focus();
  }, [abierta]);

  function teclado(evento) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      cerrar();
    } else if (evento.key === "ArrowRight") {
      evento.preventDefault();
      mover(1);
    } else if (evento.key === "ArrowLeft") {
      evento.preventDefault();
      mover(-1);
    } else if (evento.key === "Tab") {
      // El foco no sale del diálogo mientras está abierto.
      const enfocables = [...evento.currentTarget.querySelectorAll("button")];
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }
  }

  const imagenes = imagenesDeTipo(nombreTipo);
  const fotoDe = (i) => imagenes[i % imagenes.length];
  const textoFoto = (i) => (i === 0 ? `Foto principal · Habitación ${nombreTipo}` : lista[i]);

  return (
    <div className="ec-galeria-tipo">
      <div className="ec-galeria">
        {lista.slice(0, 5).map((texto, i) => (
          <FotoEjemplo key={`${texto}-${i}`} texto={textoFoto(i)} src={fotoDe(i)} />
        ))}
      </div>
      <span className="ec-galeria-tipo__contador" aria-hidden="true">
        1/{total}
      </span>
      <button ref={botonAbrir} type="button" className="ec-galeria-tipo__ver" onClick={() => abrir(0)}>
        <Images size={18} strokeWidth={1.8} aria-hidden="true" /> Ver las {total} fotos
      </button>

      {abierta && (
        <div className="ec-visor" role="presentation" onClick={(e) => e.target === e.currentTarget && cerrar()}>
          <div
            className="ec-visor__dialogo"
            role="dialog"
            aria-modal="true"
            aria-label={`Fotos de la habitación ${nombreTipo}`}
            onKeyDown={teclado}
          >
            <div className="ec-visor__barra">
              <p className="ec-visor__contador" aria-live="polite">
                Foto {actual + 1} de {total}
              </p>
              <button ref={botonCerrar} type="button" className="ec-visor__boton" onClick={cerrar} aria-label="Cerrar las fotos">
                <X size={22} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <FotoEjemplo texto={textoFoto(actual)} src={fotoDe(actual)} className="ec-visor__foto" />
            <div className="ec-visor__navegacion">
              <button type="button" className="ec-visor__boton" onClick={() => mover(-1)} aria-label="Foto anterior">
                <ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button type="button" className="ec-visor__boton" onClick={() => mover(1)} aria-label="Foto siguiente">
                <ChevronRight size={24} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
