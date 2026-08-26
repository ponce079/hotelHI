export function Table({ columnas, filas, renderFila, vacio = "No hay datos para mostrar.", columnasDerecha = [] }) {
  if (!filas || filas.length === 0) {
    return <p className="py-8 text-center text-sm text-piedra">{vacio}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th
                key={col}
                className={`border-b border-borde px-3 pb-2 font-body text-xs font-semibold uppercase tracking-wide text-tinta/55 ${
                  columnasDerecha.includes(col) ? "text-right" : "text-left"
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{filas.map((fila) => renderFila(fila))}</tbody>
      </table>
    </div>
  );
}
