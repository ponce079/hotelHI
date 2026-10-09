import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, Phone, X } from "lucide-react";
import { HOTEL } from "../ecommerce.config";

// Botón flotante "Consultanos" (rediseño): abre un panel con el teléfono y el email del
// hotel. Esc lo cierra y el foco vuelve al botón.
export function BotonConsulta() {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const telefono = HOTEL.telefono.replace(/[^\d+]/g, "");
  return (
    <div className="ec-consulta">
      {abierto && (
        <div id="ec-consulta-panel" className="ec-consulta__panel" role="dialog" aria-label="Consultanos">
          <p className="ec-consulta__titulo">¿Tenés alguna consulta?</p>
          <p className="ec-texto-2 ec-chico">Recepción {HOTEL.recepcion}. Te ayudamos con tu reserva.</p>
          <a className="ec-consulta__opcion" href={`tel:${telefono}`}>
            <Phone size={16} strokeWidth={1.7} aria-hidden="true" /> {HOTEL.telefono}
          </a>
          <a className="ec-consulta__opcion" href={`mailto:${HOTEL.email}`}>
            <Mail size={16} strokeWidth={1.7} aria-hidden="true" /> {HOTEL.email}
          </a>
        </div>
      )}
      <button
        ref={boton}
        type="button"
        className="ec-consulta__boton"
        aria-expanded={abierto}
        aria-controls="ec-consulta-panel"
        onClick={() => setAbierto((a) => !a)}
      >
        {abierto ? <X size={22} strokeWidth={1.8} aria-hidden="true" /> : <MessageCircle size={22} strokeWidth={1.8} aria-hidden="true" />}
        <span>{abierto ? "Cerrar" : "Consultanos"}</span>
      </button>
    </div>
  );
}
