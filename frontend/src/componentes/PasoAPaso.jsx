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
//
// `paso.sublabel` (opcional, por paso) es una segunda línea chica debajo
// del label — pensada para "fecha y usuario responsable" de una etapa ya
// completada (Requerimientos, ficha de detalle). Solo se pinta si el
// llamador la manda; ningún uso existente la pasa.
//
// `paso.advertencia` (opcional, por paso) pinta ESE nodo puntual en tono
// ámbar (laton) en vez del verde/pino habitual, tanto completado como
// activo — para un estado que sí se alcanzó pero necesita revisión humana
// (ej. "Recibida con diferencia", o una TRANSFERENCIA en "Pendiente de
// stock" mientras está en curso). No es un error bloqueante (rojo) ni un
// tramo limpio (verde): es su propia categoría visual.
//
// `ultimoPasoRequiereLlegada` (opcional, default false) desactiva la regla
// de siempre "estar activo en el último paso = completado" — para
// Requerimientos, donde un estado intermedio (ej. "Aprobado") puede
// ocupar la posición del ÚLTIMO nodo del array como "actual" sin que eso
// signifique que ya se alcanzó ese último hito (ej. "Cerrada"). Con esto
// en true, ese nodo solo se pinta completado cuando `pasoActual` avanza
// más allá de él (pasoActual === pasos.length). Default false: no cambia
// a Presupuestos ni Órdenes de Compra, que sí quieren esa conveniencia.
// Determina si el paso `i` está completado/activo/pendiente — compartido
// con MiniPasos.jsx (el indicador compacto de la lista) para que las dos
// lecturas de "en qué parte del camino está" nunca puedan divergir entre
// sí. Devuelve un string, no JSX: cada widget decide su propio dibujo.
export function estadoDelPaso(i, pasoActual, totalPasos, ultimoPasoRequiereLlegada = false) {
  const activo = i === pasoActual;
  // El último paso, al alcanzarse, no tiene uno siguiente que lo deje
  // "atrás" — se pinta como completado, no como "en curso", que es la
  // marca de un paso intermedio. Salvo que el llamador pida lo contrario
  // (ver comentario de PasoAPaso más abajo).
  const completado = i < pasoActual || (activo && i === totalPasos - 1 && !ultimoPasoRequiereLlegada);
  if (completado) return "completado";
  if (activo) return "actual";
  return "pendiente";
}

export function PasoAPaso({ pasos, pasoActual, pasoAlternativo, ultimoPasoRequiereLlegada = false }) {
  return (
    <div className="flex items-center justify-center gap-0 rounded-lg border border-borde bg-white px-6 py-5">
      {pasos.map((p, i) => {
        const estado = estadoDelPaso(i, pasoActual, pasos.length, ultimoPasoRequiereLlegada);
        const activo = estado === "actual";
        const completado = estado === "completado";
        return (
          <Fragment key={p.clave}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  completado
                    ? p.advertencia
                      ? "bg-laton text-hueso"
                      : "bg-pino text-hueso"
                    : activo
                      ? p.advertencia
                        ? "border-2 border-laton bg-laton-100 text-laton-700"
                        : "border-2 border-pino bg-pino-100 text-pino-700"
                      : "border-2 border-borde bg-white text-piedra"
                }`}
              >
                {p.icono ? (
                  <p.icono size={16} />
                ) : completado ? (
                  <Check size={16} />
                ) : activo ? (
                  <span className={`h-2.5 w-2.5 rounded-full ${p.advertencia ? "bg-laton" : "bg-pino"}`} />
                ) : null}
              </span>
              <span className={`text-[11.5px] font-semibold ${activo ? "text-tinta" : completado ? "text-tinta/70" : "text-piedra"}`}>
                {p.label}
              </span>
              {p.sublabel && <span className="text-[10.5px] text-piedra">{p.sublabel}</span>}
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
