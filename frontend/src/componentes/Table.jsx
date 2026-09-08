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
export function Table({
  columnas,
  filas,
  renderFila,
  vacio = "No hay datos para mostrar.",
  columnasDerecha = [],
  encabezadoDestacado = false,
  columnasOcultarImprimir = [],
}) {
  if (!filas || filas.length === 0) {
    return <p className="py-8 text-center text-sm text-piedra">{vacio}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={encabezadoDestacado ? "bg-hueso" : ""}>
            {columnas.map((col) => (
              <th
                key={col}
                className={`px-3 font-body text-xs font-semibold uppercase tracking-wide text-tinta/55 ${
                  encabezadoDestacado ? "py-2.5" : "border-b border-borde pb-2"
                } ${columnasDerecha.includes(col) ? "text-right" : "text-left"} ${
                  columnasOcultarImprimir.includes(col) ? "print:hidden" : ""
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{filas.map((fila, indice) => renderFila(fila, indice))}</tbody>
      </table>
    </div>
  );
}
