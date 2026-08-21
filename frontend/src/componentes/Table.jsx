export function Table({ columnas, filas, renderFila, vacio = "No hay datos para mostrar." }) {
  if (!filas || filas.length === 0) {
    return <p className="py-8 text-center text-sm text-piedra">{vacio}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th key={col} className="border-b border-borde px-3 pb-2 text-left text-xs font-bold uppercase tracking-wide text-piedra">
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
