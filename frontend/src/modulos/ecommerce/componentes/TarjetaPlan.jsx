import { ArrowRight } from "lucide-react";
import { Boton } from "./Boton";
import { formatearPrecio, nombreComercialPlan, textoCondicionesPlan, textoNoches } from "../formato";

// Un plan de un tipo de habitación: nombre, condiciones (armadas en el
// frontend con textoCondicionesPlan), total de la estadía y "Elegir".
export function TarjetaPlan({ plan, noches, elegido = false, onElegir, deshabilitado = false }) {
  return (
    <div className={`ec-plan ${elegido ? "ec-plan--elegido" : ""}`.trim()}>
      <div>
        <p className="ec-plan__nombre">{nombreComercialPlan(plan)}</p>
        <p className={`ec-plan__condiciones ${plan.reembolsable ? "" : "ec-plan__condiciones--nrf"}`.trim()}>
          {textoCondicionesPlan(plan)}
        </p>
      </div>
      <div className="ec-plan__precio">
        <p className="ec-plan__total">{formatearPrecio(plan.total)}</p>
        <p className="ec-plan__detalle">
          Total {textoNoches(noches)} · {formatearPrecio(plan.promedioPorNoche)} / noche
        </p>
      </div>
      {onElegir && (
        <div className="ec-plan__accion">
          <Boton
            onClick={() => onElegir(plan)}
            disabled={deshabilitado}
            aria-label={`Elegir ${nombreComercialPlan(plan)} por ${formatearPrecio(plan.total)}`}
          >
            Elegir <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
          </Boton>
        </div>
      )}
    </div>
  );
}
