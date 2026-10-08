import { useId } from "react";

// Campo de formulario con label, ayuda y error asociados (aria-describedby).
// `como`: "input" (default), "select" o "textarea". Para select, pasar las
// <option> como children. `Icono`: componente de lucide-react opcional.
export function Campo({
  label,
  como = "input",
  id,
  ayuda,
  error,
  requerido = false,
  Icono,
  className = "",
  children,
  ...props
}) {
  const idGenerado = useId();
  const idCampo = id ?? `ec-campo-${idGenerado}`;
  const idAyuda = ayuda ? `${idCampo}-ayuda` : null;
  const idError = error ? `${idCampo}-error` : null;
  const describedBy = [idAyuda, idError].filter(Boolean).join(" ") || undefined;

  const clasesControl = [
    "ec-campo__control",
    como === "select" ? "ec-campo__control--select" : "",
    como === "textarea" ? "ec-campo__control--area" : "",
    Icono ? "ec-campo__control--con-icono" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const comunes = {
    id: idCampo,
    className: clasesControl,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    required: requerido || undefined,
    ...props,
  };

  let control;
  if (como === "select") control = <select {...comunes}>{children}</select>;
  else if (como === "textarea") control = <textarea {...comunes} />;
  else control = <input {...comunes} />;

  return (
    <div className={`ec-campo ${error ? "ec-campo--error" : ""} ${className}`.trim()}>
      <label className="ec-campo__label" htmlFor={idCampo}>
        {label}
        {requerido && (
          <span className="ec-campo__requerido" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      <div className="ec-campo__envoltura">
        {Icono && <Icono className="ec-campo__icono" size={20} strokeWidth={1.7} aria-hidden="true" />}
        {control}
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
