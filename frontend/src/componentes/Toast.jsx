import { CheckCircle2 } from "lucide-react";

export function Toast({ mensaje }) {
  if (!mensaje) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-borde bg-exito-suave px-4 py-3 text-sm font-semibold text-exito shadow-lg">
      <CheckCircle2 size={18} />
      {mensaje}
    </div>
  );
}
