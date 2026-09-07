import { estadoDelPaso } from "./PasoAPaso";

// Rediseño de Requerimientos, punto 4 — indicador compacto para una fila
// de tabla, sin texto. Reescrito para consumir el mismo {pasos, pasoActual}
// que arma requerimientosTimeline.js (construirEtapasRequerimiento) — antes
// tenía su propio switch/if-else independiente (requerimientosPasos.js,
// ahora borrado) con 4 segmentos fijos, que no reflejaba caminos reales de
// 3 a 5 pasos según tipo/origen y se desincronizó del timeline grande de
// la ficha de detalle.
//
// 4 colores sólidos, uno por categoría real de paso — no "un solo color de
// fila según categoría" como antes: cada punto es SU propio estado.
// `estadoDelPaso` es la misma función que ya usa PasoAPaso.jsx (el
// stepper grande de la ficha), así que las dos lecturas nunca pueden
// divergir entre sí.
export const COLOR_POR_ESTADO_PASO = {
  completado: "bg-pino",
  actual: "bg-info",
  advertencia: "bg-laton",
  pendiente: "bg-neutro-500",
};

// `pasos`/`pasoActual`: salida de construirEtapasRequerimiento(r) — la
// cantidad de puntos varía por instancia, no es un número fijo.
// `ultimoPasoRequiereLlegada` (default true): mismo criterio que ya usa
// PasoAPaso.jsx en la ficha de detalle — un estado intermedio (ej.
// "Aprobado") no puede pintar el último punto como completado solo por
// ocupar esa posición.
export function MiniPasos({ pasos, pasoActual, ultimoPasoRequiereLlegada = true }) {
  return (
    <div className="inline-flex items-center gap-1">
      {pasos.map((p, i) => {
        const estadoBase = estadoDelPaso(i, pasoActual, pasos.length, ultimoPasoRequiereLlegada);
        const estado = p.advertencia && estadoBase !== "pendiente" ? "advertencia" : estadoBase;
        return (
          <span
            key={p.clave}
            title={estado === "advertencia" ? `${p.label} — necesita revisión` : p.label}
            className={`h-1.5 w-5 rounded-full ${COLOR_POR_ESTADO_PASO[estado]}`}
          />
        );
      })}
    </div>
  );
}
