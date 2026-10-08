import { useId, useRef } from "react";
import { CalendarDays } from "lucide-react";
import { formatearFecha } from "../formato";

// Campo de fecha (etapa 2): un <input type="date"> NATIVO (teclado, lector
// de pantalla, min/max y selector del sistema) con el valor visible en
// formato legible ("Vie 16 oct 2026") superpuesto. El texto superpuesto es
// aria-hidden: el input conserva su label y su valor accesible. Por dentro
// el valor sigue siendo AAAA-MM-DD. Misma estructura y clases que Campo
// (ec-campo, aria-describedby con ayuda y error).
export function CampoFecha({ label, value, onChange, error, ayuda, min, max, id, className = "", ...props }) {
  const idGenerado = useId();
  const idCampo = id ?? `ec-fecha-${idGenerado}`;
  const idAyuda = ayuda ? `${idCampo}-ayuda` : null;
  const idError = error ? `${idCampo}-error` : null;
  const describedBy = [idAyuda, idError].filter(Boolean).join(" ") || undefined;
  const referencia = useRef(null);
  const legible = value ? formatearFecha(value) : "";

  // Un clic en cualquier parte del campo abre el selector del sistema (donde
  // el navegador lo permite); con el teclado, el input funciona como siempre.
  function abrirSelector() {
    try {
      referencia.current?.showPicker?.();
    } catch {
      // Navegadores sin showPicker o sin gesto de usuario: no pasa nada.
    }
  }

  return (
    <div className={`ec-campo ec-campo-fecha ${error ? "ec-campo--error" : ""} ${className}`.trim()}>
      <label className="ec-campo__label" htmlFor={idCampo}>
        {label}
      </label>
      <div className={`ec-campo__envoltura ${legible ? "ec-campo-fecha--con-valor" : ""}`.trim()}>
        <CalendarDays className="ec-campo__icono" size={20} strokeWidth={1.7} aria-hidden="true" />
        <input
          ref={referencia}
          id={idCampo}
          type="date"
          className="ec-campo__control ec-campo__control--con-icono ec-campo-fecha__control"
          value={value ?? ""}
          min={min}
          max={max}
          onChange={onChange}
          onClick={abrirSelector}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {legible && (
          <span className="ec-campo-fecha__legible" aria-hidden="true">
            {legible}
          </span>
        )}
      </div>
      {ayuda && (
        <p id={idAyuda} className="ec-campo__ayuda">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="ec-campo__error">
          {error}
        </p>
      )}
    </div>
  );
}
