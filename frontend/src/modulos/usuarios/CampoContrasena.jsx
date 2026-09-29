import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Input de contraseña con el botón del ojito para mostrarla/ocultarla.
// Mismo look que <Input>.
export function CampoContrasena({ label, error, className = "", ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="flex flex-col gap-1.5 font-body text-sm">
      {label && <span className="text-[12px] text-tinta/70">{label}</span>}
      <span className="relative flex">
        <input
          type={visible ? "text" : "password"}
          className={`w-full rounded-md border bg-white py-2 pl-3 pr-10 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40 ${
            error ? "border-error" : "border-borde"
          } ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-piedra hover:text-tinta"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {error && <span className="text-[11.5px] text-error-texto">{error}</span>}
    </label>
  );
}
