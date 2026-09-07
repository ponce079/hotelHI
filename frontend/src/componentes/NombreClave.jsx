// Nombre "principal" de una fila/card — proveedor, artículo, etc. — cuando
// es el dato que la persona usa para reconocer de un vistazo qué está
// mirando. Mismo bug transversal que CodigoClave.jsx: cada pantalla lo
// escribía en un tamaño distinto y casi siempre chico (12.5-13.5px).
// `title` es opcional pero se pasa casi siempre junto con `truncate` en el
// className del caller: con el nombre cortado, el tooltip es la única forma
// de leerlo completo.
//
// `tamano`: "fila" (default) es para nombres dentro de una tabla/lista —
// mismo font-body que ya usa el resto de la fila, solo más grande y con
// peso. "card" es para el título de una card (ej. el proveedor en
// Comparación de presupuestos) — conserva el font-heading que ya tenían
// esos títulos, solo agranda el tamaño.
const TAMANOS = {
  fila: "font-body text-[14.5px]",
  card: "font-heading text-[19px]",
};

// Sin color propio a propósito — ver el mismo comentario en CodigoClave.jsx.
export function NombreClave({ tamano = "fila", className = "", title, children }) {
  return (
    <span className={`${TAMANOS[tamano] ?? TAMANOS.fila} font-semibold ${className}`} title={title}>
      {children}
    </span>
  );
}
