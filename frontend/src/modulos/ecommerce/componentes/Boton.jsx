import { Link } from "react-router-dom";

// Botón de la guía de estilo: primario (relleno verde), secundario (borde),
// claro (sobre fondo oscuro) o texto (link). Con `to` renderiza un <Link>.
// `formulario` lo deja en 48 px de alto (dentro de formularios).
export function Boton({
  variante = "primario",
  formulario = false,
  bloque = false,
  to,
  className = "",
  type = "button",
  children,
  ...props
}) {
  const clases = [
    "ec-boton",
    `ec-boton--${variante}`,
    formulario ? "ec-boton--formulario" : "",
    bloque ? "ec-boton--bloque" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (to) {
    return (
      <Link to={to} className={clases} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={clases} {...props}>
      {children}
    </button>
  );
}
