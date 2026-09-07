// confirmado -> pino · en transito -> laton · con diferencia -> rojo ·
// dado de baja -> gris neutro. Fondo = tinte 100 del rol, texto = paso 700
// (guia visual SGH, seccion 5). "info" (azul apagado) se sumo para el
// rediseno de Requerimientos: es la categoria "En curso", la unica de las
// 4 categorias fijas que no tenia un color propio entre las 4 que habia.
const VARIANTES = {
  ok: "bg-pino-100 text-pino-700",
  alerta: "bg-laton-100 text-laton-700",
  error: "bg-error-suave text-error-texto",
  neutro: "bg-neutro-100 text-neutro-700",
  info: "bg-info-suave text-info-texto",
};

export function Badge({ variante = "ok", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 font-body text-xs font-medium tracking-[0.01em] ${VARIANTES[variante]}`}>
      {children}
    </span>
  );
}
