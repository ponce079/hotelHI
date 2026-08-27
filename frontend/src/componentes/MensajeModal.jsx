import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

// A diferencia de Toast (chiquito, abajo a la derecha), este ocupa el
// centro de la pantalla con backdrop — para confirmaciones que ameritan
// mas presencia (ej. movimientos de stock). Se autocierra solo, no tiene
// botones ni requiere click del usuario.
export function MensajeModal({ mensaje, duracion = 2500, onCerrar }) {
  useEffect(() => {
    if (!mensaje) return;
    const timer = setTimeout(onCerrar, duracion);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensaje, duracion]);

  if (!mensaje) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/45 p-6">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl bg-white px-8 py-8 text-center shadow-2xl">
        <CheckCircle2 size={40} className="text-exito" />
        <p className="m-0 font-body text-[15px] font-semibold leading-relaxed text-tinta">{mensaje}</p>
      </div>
    </div>
  );
}
