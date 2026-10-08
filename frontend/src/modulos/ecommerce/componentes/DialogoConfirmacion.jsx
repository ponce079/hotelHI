import { useEffect, useId, useRef } from "react";
import { Boton } from "./Boton";

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Diálogo modal accesible (role="dialog", aria-modal): al abrirse enfoca la
// opción que NO hace nada ("Volver"), mantiene el foco adentro con Tab,
// cierra con Esc y, al cerrarse, devuelve el foco a donde estaba. Mientras
// `ocupado` es true no se puede cerrar y los botones quedan deshabilitados. `confirmarDeshabilitado` solo apaga
// el botón de confirmar (por ejemplo, hasta tildar una casilla).
export function DialogoConfirmacion({
  abierto,
  titulo,
  children,
  textoConfirmar,
  textoOcupado,
  textoVolver = "Volver",
  peligro = false,
  ocupado = false,
  confirmarDeshabilitado = false,
  onConfirmar,
  onCerrar,
}) {
  const idTitulo = useId();
  const idTexto = useId();
  const refDialogo = useRef(null);
  const refVolver = useRef(null);
  const refOcupado = useRef(ocupado);
  const refOnCerrar = useRef(onCerrar);
  refOcupado.current = ocupado;
  refOnCerrar.current = onCerrar;

  useEffect(() => {
    if (!abierto) return undefined;
    const anterior = document.activeElement;
    refVolver.current?.focus();

    function alTeclear(evento) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        if (!refOcupado.current) refOnCerrar.current?.();
        return;
      }
      if (evento.key !== "Tab" || !refDialogo.current) return;
      const enfocables = [...refDialogo.current.querySelectorAll(ENFOCABLES)];
      if (enfocables.length === 0) {
        evento.preventDefault();
        return;
      }
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const dentro = refDialogo.current.contains(document.activeElement);
      if (evento.shiftKey && (document.activeElement === primero || !dentro)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (document.activeElement === ultimo || !dentro)) {
        evento.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      if (anterior && typeof anterior.focus === "function" && document.contains(anterior)) anterior.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="ec-dialogo-fondo">
      <div
        ref={refDialogo}
        className="ec-dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idTexto}
      >
        <h2 id={idTitulo} className="ec-dialogo__titulo">
          {titulo}
        </h2>
        <div id={idTexto} className="ec-pila">
          {children}
        </div>
        <div className="ec-dialogo__acciones">
          <Boton ref={refVolver} variante="secundario" formulario onClick={onCerrar} disabled={ocupado}>
            {textoVolver}
          </Boton>
          <Boton
            formulario
            className={peligro ? "ec-boton--peligro" : ""}
            onClick={onConfirmar}
            disabled={ocupado || confirmarDeshabilitado}
            aria-busy={ocupado || undefined}
          >
            {ocupado && textoOcupado ? textoOcupado : textoConfirmar}
          </Boton>
        </div>
      </div>
    </div>
  );
}
