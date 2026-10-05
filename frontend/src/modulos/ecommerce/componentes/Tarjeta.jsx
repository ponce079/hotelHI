// Contenedor con fondo papel, borde de línea y radio de tarjeta.
export function Tarjeta({ como: Etiqueta = "div", relleno = false, deshabilitada = false, className = "", children, ...props }) {
  const clases = [
    "ec-tarjeta",
    relleno ? "ec-tarjeta--relleno" : "",
    deshabilitada ? "ec-tarjeta--deshabilitada" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Etiqueta className={clases} {...props}>
      {children}
    </Etiqueta>
  );
}
