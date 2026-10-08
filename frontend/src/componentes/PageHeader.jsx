// Encabezado de página (HU-117): reemplaza al banner verde. Título h1 en la
// serif de marca, una línea de subtítulo opcional y acciones a la derecha.
export function PageHeader({ titulo, subtitulo, acciones, className = "" }) {
  return (
    <header className={`page-header ${className}`}>
      <div className="page-header-titulos">
        <h1>{titulo}</h1>
        {subtitulo && <div className="page-header-sub">{subtitulo}</div>}
      </div>
      {acciones && <div className="page-header-acciones">{acciones}</div>}
    </header>
  );
}
