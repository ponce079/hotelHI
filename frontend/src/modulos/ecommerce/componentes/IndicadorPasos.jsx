import { Fragment } from "react";
import { Check } from "lucide-react";
import { PASOS } from "../ecommerce.constantes";

// Habitación → Tus datos → Pago → Confirmación. `actual` = número de paso (1 a 4).
export function IndicadorPasos({ actual }) {
  return (
    <nav aria-label="Pasos de la reserva">
      <ol className="ec-pasos">
        {PASOS.map((paso, i) => {
          const hecho = paso.numero < actual;
          const esActual = paso.numero === actual;
          const clase = `ec-paso ${hecho ? "ec-paso--hecho" : ""} ${esActual ? "ec-paso--actual" : ""}`.trim();
          return (
            <Fragment key={paso.clave}>
              {i > 0 && (
                <li aria-hidden="true" className={`ec-paso__linea ${paso.numero <= actual ? "ec-paso__linea--hecha" : ""}`.trim()} />
              )}
              <li className={clase} aria-current={esActual ? "step" : undefined}>
                <span className="ec-paso__circulo">
                  {hecho ? <Check size={18} strokeWidth={2} aria-hidden="true" /> : paso.numero}
                </span>
                <span className="ec-paso__etiqueta">
                  {paso.etiqueta}
                  {hecho && <span className="ec-visualmente-oculto"> (completo)</span>}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
