// IBM Plex Mono es solo para "lo que se copia o se compara caracter por
// caracter": codigos, IDs, referencias. Nunca para texto que se lee de
// corrido (eso es Sora, el font-body). Mapa de tamanos (no interpolar el
// numero en la clase: Tailwind necesita ver la clase completa y literal
// en el codigo fuente para generarla).
const TAMANOS = {
  11: "text-[11px]",
  11.5: "text-[11.5px]",
  12: "text-[12px]",
};

export function Codigo({ tamano = 12, className = "", children }) {
  return <span className={`font-mono ${TAMANOS[tamano] ?? TAMANOS[12]} ${className}`}>{children}</span>;
}
