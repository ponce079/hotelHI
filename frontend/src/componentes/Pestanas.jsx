import { useRef } from "react";

// Pestañas con contador (listados por estado).
//
// Uso:
//   <Pestanas
//     etiqueta="Estado de las reservas"          // nombre accesible del tablist
//     pestanas={[{ valor: "", etiqueta: "Todas", cantidad: 203 }, { valor: "En curso", etiqueta: "En curso", cantidad: 12 }]}
//     activa={estado}                            // `valor` de la pestaña activa
//     onCambiar={(valor) => ...}
//     idBase="reservas"                          // opcional: ids "reservas-tab-<n>" para aria-controls/aria-labelledby
//   />
// `cantidad` puede ser undefined/null (cargando): no se dibuja la píldora. El contenido que cambia con la pestaña va
// en un elemento con role="tabpanel" y aria-labelledby={idPestana(idBase, valor)}.
// Teclado: ←/→ mueven el foco (con vuelta), Inicio/Fin saltan a la primera/última, Enter o Espacio activan.
// Solo la pestaña activa entra con Tab. Estilos en estilos/shell.css (.pestana). El divisor inferior es una sombra interior
// (no un borde) para que el subrayado de la pestaña activa quede entero dentro del contenedor: con `overflow-y: hidden`
// y un margen negativo, en pantallas con zoom o escala fraccionaria se recortaba y la línea desaparecía.
export const idPestana = (idBase, valor) => `${idBase}-tab-${String(valor || "todas").replace(/\s+/g, "-").toLowerCase()}`;

export function Pestanas({ pestanas, activa, onCambiar, etiqueta, idBase = "pestanas", className = "" }) {
  const refs = useRef([]);

  function alTeclear(evento, indice) {
    const ultimo = pestanas.length - 1;
    const destino = {
      ArrowRight: indice === ultimo ? 0 : indice + 1,
      ArrowLeft: indice === 0 ? ultimo : indice - 1,
      Home: 0,
      End: ultimo,
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    refs.current[destino]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className={`flex gap-6 overflow-x-auto overflow-y-hidden px-5 shadow-[inset_0_-1px_0_var(--divisor-fila)] ${className}`}
    >
      {pestanas.map((p, indice) => {
        const seleccionada = p.valor === activa;
        return (
          <button
            key={p.valor || "todas"}
            ref={(el) => (refs.current[indice] = el)}
            id={idPestana(idBase, p.valor)}
            type="button"
            role="tab"
            aria-selected={seleccionada}
            aria-controls={`${idBase}-panel`}
            tabIndex={seleccionada ? 0 : -1}
            className="pestana"
            onClick={() => onCambiar(p.valor)}
            onKeyDown={(e) => alTeclear(e, indice)}
          >
            {p.etiqueta}
            {p.cantidad != null && <span className="pestana-contador">{p.cantidad}</span>}
          </button>
        );
      })}
    </div>
  );
}
