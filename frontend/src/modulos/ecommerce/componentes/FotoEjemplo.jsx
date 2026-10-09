import { Camera } from "lucide-react";

// Foto de una pantalla del sitio. Con `src` muestra la foto (rediseño "Holiday Inn
// Salta"); sin `src`, el placeholder del mockup. `texto` es siempre el nombre accesible.
export function FotoEjemplo({ texto, src, className = "" }) {
  if (src) {
    return (
      <div className={`ec-foto ec-foto--real ${className}`.trim()} role="img" aria-label={texto}>
        <img className="ec-foto-real" src={src} alt="" loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`ec-foto ${className}`.trim()} role="img" aria-label={texto}>
      <Camera size={28} strokeWidth={1.6} aria-hidden="true" />
      <span className="ec-foto__texto" aria-hidden="true">
        {texto}
      </span>
    </div>
  );
}
