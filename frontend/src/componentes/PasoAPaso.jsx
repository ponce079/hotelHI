import { Fragment } from "react";
import { Check, X } from "lucide-react";

// Timeline horizontal para estados que avanzan en un solo sentido (nunca
// retroceden): Requerimientos, Presupuestos (rama ganadora) y Órdenes de
// Compra (rama sin anular). Ramas alternativas/terminales (Rechazado,
// Anulada) no encajan en una barra de progreso lineal — cada pantalla
// decide mostrar otra cosa en esos casos en vez de forzarlas acá.
//
// `pasoAlternativo` (opcional, no cambia ningún uso existente) es una
// salida del camino lineal (ej. "Anulada") que se muestra aparte, separada
// por un espacio sin línea de conexión: no es "el paso siguiente", es una
// bifurcación. `{ label, activo }` — activo=true la pinta como el estado
// real actual (rojo, con X); activo=false la deja atenuada, solo indicando
// que esa salida existe.
//
// `paso.icono` (opcional, por paso) es un ícono propio que representa ESE
// estado puntual (ej. un reloj para "Pendiente", un sobre para "Enviada") —
// si se pasa, se muestra siempre en ese círculo sin importar si el paso ya
// se completó, está en curso o todavía no llega (el color de fondo/borde ya
// comunica el progreso). Sin `icono` el paso sigue con el check/punto/vacío
// de siempre — no rompe a Requerimientos ni Presupuestos, que no lo pasan.
export function PasoAPaso({ pasos, pasoActual, pasoAlternativo }) {
  return (
    <div className="flex items-center justify-center gap-0 rounded-lg border border-borde bg-white px-6 py-5">
      {pasos.map((p, i) => {
        const activo = i === pasoActual;
        // El último paso, al alcanzarse, no tiene uno siguiente que lo deje
        // "atrás" — se pinta como completado (check), no como "en curso"
        // (punto), que es la marca de un paso intermedio.
        const completado = i < pasoActual || (activo && i === pasos.length - 1);
        return (
          <Fragment key={p.clave}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  completado
                    ? "bg-pino text-hueso"
                    : activo
                      ? "border-2 border-pino bg-pino-100 text-pino-700"
                      : "border-2 border-borde bg-white text-piedra"
                }`}
              >
                {p.icono ? (
                  <p.icono size={16} />
                ) : completado ? (
                  <Check size={16} />
                ) : activo ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-pino" />
                ) : null}
              </span>
              <span className={`text-[11.5px] font-semibold ${activo ? "text-tinta" : completado ? "text-tinta/70" : "text-piedra"}`}>
                {p.label}
              </span>
            </div>
            {i < pasos.length - 1 && <span className={`mb-5 h-px w-16 sm:w-28 ${i < pasoActual ? "bg-pino" : "bg-borde"}`} />}
          </Fragment>
        );
      })}

      {pasoAlternativo && (
        <>
          <span className="mx-4 mb-5 h-9 w-px bg-borde" />
          <div className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                pasoAlternativo.activo ? "bg-error text-hueso" : "border-2 border-borde bg-white text-piedra/60"
              }`}
            >
              <X size={16} />
            </span>
            <span className={`text-[11.5px] font-semibold ${pasoAlternativo.activo ? "text-error-texto" : "text-piedra/60"}`}>
              {pasoAlternativo.label}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
