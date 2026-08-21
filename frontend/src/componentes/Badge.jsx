const VARIANTES = {
  ok: "bg-exito-suave text-exito",
  alerta: "bg-alerta-suave text-alerta",
  error: "bg-error-suave text-error",
};

export function Badge({ variante = "ok", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${VARIANTES[variante]}`}>
      {children}
    </span>
  );
}
