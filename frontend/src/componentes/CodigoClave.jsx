// Identificador clave de un comprobante (REQ-0001, OC-0001, etc.) — mismo
// tratamiento en toda la app para que un número no se pierda visualmente
// frente al resto de la fila/header. Antes cada pantalla lo escribía suelto
// (la mayoría en `font-mono text-xs`, 12px, sin peso extra) — bug
// transversal reportado en la revisión de Comparación de presupuestos.
// Mismo patrón que Cifra.jsx: encapsular acá evita que cada pantalla
// vuelva a elegir su propio tamaño.
// Sin color propio a propósito: hereda el `currentColor` de donde se use
// (la mayoría de los casos ya viven en un contexto con el color correcto) —
// así un caller que necesita un tono distinto (ej. `text-tinta/70` para una
// referencia secundaria repetida) lo puede pasar por `className` sin pelear
// contra una clase de color ya puesta acá adentro.
export function CodigoClave({ className = "", children }) {
  return <span className={`font-mono text-[14px] font-semibold ${className}`}>{children}</span>;
}
