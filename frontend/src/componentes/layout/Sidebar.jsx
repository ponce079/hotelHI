import { Link } from "react-router-dom";
import { ChevronDown, Mountain, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { MenuCuenta } from "./MenuCuenta";

// `badge`: { cantidad, tono, titulo }. Con 0 no se muestra nada. Contraído la burbuja pasa a un punto y el número
// va en el title del ítem.
function ItemMenu({ item, activo, contraido, badge }) {
  const { icon: Icono, to, label } = item;
  const cantidad = badge?.cantidad ?? 0;
  const detalle = badge?.titulo ?? (cantidad > 0 ? String(cantidad) : "");
  return (
    <Link
      to={to}
      className="sb-item"
      aria-current={activo ? "page" : undefined}
      // Contraído solo queda el ícono: el nombre pasa a tooltip y a nombre accesible.
      title={contraido ? (cantidad > 0 ? `${label} · ${detalle}` : label) : undefined}
      aria-label={contraido ? label : undefined}
    >
      <Icono size={18} strokeWidth={1.8} aria-hidden="true" />
      <span className="sb-item-txt">{label}</span>
      {cantidad > 0 && (
        <span className={`sb-badge sb-badge-${badge.tono ?? "terracota"}`} title={contraido ? undefined : badge.titulo}>
          {cantidad}
        </span>
      )}
    </Link>
  );
}

// Menú lateral (HU-117). Presentacional: Layout decide qué bloques se ven (ya
// filtrados por rol), cuáles están abiertos y qué ruta está activa.
export function Sidebar({
  bloques,
  activo,
  gruposAbiertos,
  onToggleGrupo,
  badges,
  contraido,
  onToggleContraido,
  movilAbierto,
  onCerrarMovil,
  cuenta,
}) {
  return (
    <>
      {movilAbierto && <button type="button" className="sb-velo" aria-label="Cerrar menú" onClick={onCerrarMovil} />}
      <aside id="menu-lateral" className="sb" data-contraido={contraido} data-abierto={movilAbierto} aria-label="Menú lateral">
        <div className="sb-head">
          <div className="sb-logo" aria-hidden="true">
            <Mountain size={20} strokeWidth={1.8} />
          </div>
          <div className="sb-marca">
            <span className="sb-marca-nombre">Holiday Inn</span>
            <span className="sb-marca-sub">SALTA · SGH</span>
          </div>
          <button
            type="button"
            className="sb-icono-btn sb-toggle"
            onClick={onToggleContraido}
            aria-label={contraido ? "Expandir menú" : "Contraer menú"}
            title={contraido ? "Expandir menú" : "Contraer menú"}
          >
            {contraido ? <PanelLeftOpen size={18} strokeWidth={1.8} /> : <PanelLeftClose size={18} strokeWidth={1.8} />}
          </button>
          <button type="button" className="sb-icono-btn sb-cerrar-movil" onClick={onCerrarMovil} aria-label="Cerrar menú">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <nav className="sb-nav" aria-label="Navegación principal">
          {bloques.map((bloque) => {
            const abierto = bloque.grupo === null || contraido || gruposAbiertos[bloque.grupo];
            const idLista = `menu-grupo-${bloque.grupo ?? "inicio"}`.replace(/\s+/g, "-");
            return (
              <div key={bloque.grupo ?? "inicio"} className="sb-bloque">
                {bloque.grupo !== null && (
                  <button
                    type="button"
                    className="sb-grupo"
                    aria-expanded={Boolean(gruposAbiertos[bloque.grupo])}
                    aria-controls={idLista}
                    onClick={() => onToggleGrupo(bloque.grupo)}
                  >
                    {bloque.grupo}
                    <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
                {abierto && (
                  <div className="sb-lista" id={idLista}>
                    {bloque.items.map((item) => (
                      <ItemMenu
                        key={item.to}
                        item={item}
                        activo={activo?.item.to === item.to}
                        contraido={contraido}
                        badge={badges[item.to]}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <MenuCuenta {...cuenta} />
      </aside>
    </>
  );
}
