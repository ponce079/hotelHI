import { CATEGORIAS_REQUERIMIENTO } from "../lib/constantes";

// Rediseño de Requerimientos, punto 4: indicador compacto de 4 pasos para
// una fila de tabla — sin texto, para escanear el circuito sin leer el
// estado. Para el stepper grande con labels de la ficha de detalle, ver
// PasoAPaso.jsx (son dos widgets distintos a propósito: ese lleva label
// por paso y ancho para 3 pasos, este tiene que entrar angosto en una
// celda con 4).
// Exportado: la leyenda de colores del listado de Requerimientos usa esta
// misma paleta para sus referencias, en vez de repetirla a mano.
export const COLOR_RELLENO_POR_CATEGORIA = {
  [CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION]: "bg-error-texto",
  [CATEGORIAS_REQUERIMIENTO.EN_CURSO]: "bg-info",
  [CATEGORIAS_REQUERIMIENTO.COMPLETADO]: "bg-pino",
  [CATEGORIAS_REQUERIMIENTO.CANCELADO]: "bg-neutro-500",
};

const NOMBRES_PASO = ["Solicitud", "Aprobación", "Compra o transferencia", "Recepción"];

// `pasoActual`: índice (0-3) del último paso alcanzado — los segmentos
// hasta ahí se pintan con el color de `categoria`, el resto queda gris.
export function MiniPasos({ pasoActual, categoria }) {
  const color = COLOR_RELLENO_POR_CATEGORIA[categoria] ?? "bg-neutro-500";
  return (
    <div
      className="inline-flex items-center gap-1"
      title={`${NOMBRES_PASO[pasoActual] ?? "Solicitud"} · paso ${pasoActual + 1} de ${NOMBRES_PASO.length}`}
    >
      {NOMBRES_PASO.map((nombre, i) => (
        <span key={nombre} className={`h-1.5 w-5 rounded-full ${i <= pasoActual ? color : "bg-borde"}`} />
      ))}
    </div>
  );
}
