import { Children, cloneElement, isValidElement } from "react";

// Tabla genérica del SGH. Props de siempre: `columnas` (títulos), `filas`, `renderFila(fila, indice)` que devuelve el
// <tr> completo, `vacio` (texto), `columnasDerecha`, `anchosColumnas`, `className`.
//
// `encabezadoDestacado` es opt-in (default false, no cambia ninguna tabla
// existente): pinta el header con una banda `bg-hueso` — el tono cálido
// que ya es el fondo de toda la app — en vez del header plano de siempre.
// Se usa en pantallas puntuales (ej. Artículos solicitados del
// requerimiento) donde ese contraste ayuda a separar el header de la data.
//
// `columnasOcultarImprimir` (opt-in, default []): columnas que no tienen
// sentido en un documento impreso (ej. "Recibido" en la Orden de Compra —
// es seguimiento interno, no algo que lleve el comprobante). Solo pone
// `print:hidden` en el <th>; el caller tiene que poner la misma clase en
// el <td> correspondiente de su renderFila, porque las celdas del body
// las arma el caller, no este componente.
//
// Opcionales del rediseño (valores por defecto = comportamiento anterior):
//  - `onRowClick(fila)`: toda la fila navega/abre algo. Se ignora si el clic cayó en un enlace, botón o campo de la
//    fila (el menú ⋮, el enlace del nombre). El teclado entra por el enlace real que ponga renderFila, no por la fila.
//  - `cargando`: muestra `filasSkeleton` filas de relleno en vez de la tabla.
//  - `vacioTitulo` + `vacioDescripcion`: estado vacío centrado con título en la serif de marca (si no se pasan, se
//    usa el texto `vacio` de siempre).
//  - `claseFila(fila)`: clases extra para el <tr> (por ejemplo "tabla-sgh-fila-atenuada").
// El contenedor scrollea en horizontal por dentro: la página nunca.
// Los estilos por defecto (.tabla-sgh en estilos/shell.css) viven en @layer components: las utilidades de Tailwind
// que cada pantalla pone en sus td/tr ganan siempre.
export function Table({
  columnas,
  filas,
  renderFila,
  vacio = "No hay datos para mostrar.",
  columnasDerecha = [],
  encabezadoDestacado = false,
  columnasOcultarImprimir = [],
  className = "",
  anchosColumnas = [],
  onRowClick,
  cargando = false,
  filasSkeleton = 6,
  vacioTitulo,
  vacioDescripcion,
  claseFila,
}) {
  if (!cargando && (!filas || filas.length === 0)) {
    if (vacioTitulo) {
      return (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <p className="font-heading text-[26px] font-semibold leading-tight text-tinta">{vacioTitulo}</p>
          {vacioDescripcion && <p className="max-w-md text-[13.5px] text-piedra">{vacioDescripcion}</p>}
        </div>
      );
    }
    return <p className="py-8 text-center text-sm text-piedra">{vacio}</p>;
  }

  function filaConClick(fila, indice) {
    const elemento = renderFila(fila, indice);
    if (!isValidElement(elemento)) return elemento;
    const extra = claseFila?.(fila);
    if (!onRowClick && !extra) return elemento;
    const props = {};
    if (extra) props.className = `${elemento.props.className ?? ""} ${extra}`.trim();
    if (onRowClick) {
      props.className = `${props.className ?? elemento.props.className ?? ""} tabla-sgh-fila-click`.trim();
      props.onClick = (evento) => {
        elemento.props.onClick?.(evento);
        if (evento.defaultPrevented) return;
        if (evento.target.closest?.("a, button, input, select, textarea, label")) return;
        onRowClick(fila);
      };
    }
    return cloneElement(elemento, props);
  }

  return (
    <div className="overflow-x-auto">
      <table className={`tabla-sgh w-full text-sm ${className}`}>
        {anchosColumnas.length > 0 && (
          <colgroup>
            {columnas.map((columna, indice) => (
              <col key={`${columna}-${indice}`} style={{ width: anchosColumnas[indice] }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr className={encabezadoDestacado ? "bg-hueso" : ""}>
            {columnas.map((col, indice) => (
              <th
                key={`${col}-${indice}`}
                className={`px-3 font-body ${
                  encabezadoDestacado ? "py-2.5" : "border-b border-borde pb-2.5"
                } ${columnasDerecha.includes(col) ? "text-right" : "text-left"} ${
                  columnasOcultarImprimir.includes(col) ? "print:hidden" : ""
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cargando
            ? Children.toArray(
                Array.from({ length: filasSkeleton }, (_, i) => (
                  <tr key={i} aria-hidden="true" className="h-[72px]">
                    {columnas.map((col, c) => (
                      <td key={`${col}-${c}`} className="px-3 py-4">
                        <div className="h-3.5 w-full max-w-[160px] animate-pulse rounded bg-neutro-300/70" />
                        {c === 0 && <div className="mt-2 h-3 w-24 animate-pulse rounded bg-neutro-300/50" />}
                      </td>
                    ))}
                  </tr>
                )),
              )
            : filas.map((fila, indice) => filaConClick(fila, indice))}
        </tbody>
      </table>
    </div>
  );
}
