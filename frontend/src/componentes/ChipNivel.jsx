// Chip del nivel de una temporada (BASE, BAJA, MEDIA, ALTA, EVENTO) con los tokens --nivel-* de variables.css.
export function ChipNivel({ nivel }) {
  const clave = nivel.toLowerCase();
  return (
    <span
      className="inline-flex items-center rounded-sm px-2 py-px text-[11px] font-semibold tracking-[0.04em]"
      style={{ backgroundColor: `var(--nivel-${clave}-bg)`, color: `var(--nivel-${clave}-texto)` }}
    >
      {nivel}
    </span>
  );
}
