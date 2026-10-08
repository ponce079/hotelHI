// Esqueletos de carga (etapa 2). Decorativos: el anuncio para lectores de
// pantalla lo da el contenedor con role="status".
export function EsqueletoTarjetaTipo({ conPlanes = false }) {
  return (
    <div className="ec-esqueleto-tarjeta" aria-hidden="true">
      <div className="ec-esqueleto ec-esqueleto--foto" />
      <div className="ec-esqueleto-tarjeta__cuerpo">
        <div className="ec-esqueleto ec-esqueleto--titulo" />
        <div className="ec-esqueleto ec-esqueleto--linea" />
        <div className="ec-esqueleto ec-esqueleto--linea ec-esqueleto--corta" />
        {conPlanes && (
          <>
            <div className="ec-esqueleto ec-esqueleto--plan" />
            <div className="ec-esqueleto ec-esqueleto--plan" />
          </>
        )}
      </div>
    </div>
  );
}

export function CargandoTarjetas({ cantidad = 2, conPlanes = false, texto = "Cargando…", className = "" }) {
  return (
    <div className={`ec-esqueletos ${className}`.trim()} role="status" aria-live="polite">
      <span className="ec-solo-lector">{texto}</span>
      {Array.from({ length: cantidad }, (_, i) => (
        <EsqueletoTarjetaTipo key={i} conPlanes={conPlanes} />
      ))}
    </div>
  );
}
