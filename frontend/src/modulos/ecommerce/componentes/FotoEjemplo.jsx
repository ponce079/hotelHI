import { Camera } from "lucide-react";

// Placeholder de foto, como en el mockup, hasta tener fotos reales.
export function FotoEjemplo({ texto, className = "" }) {
  return (
    <div className={`ec-foto ${className}`.trim()} role="img" aria-label={texto}>
      <Camera size={28} strokeWidth={1.6} aria-hidden="true" />
      <span className="ec-foto__texto" aria-hidden="true">
        {texto}
      </span>
    </div>
  );
}
