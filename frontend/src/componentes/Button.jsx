const VARIANTES = {
  primario: "bg-pino text-white hover:bg-pino-oscuro",
  secundario: "bg-transparent text-tinta border border-borde hover:bg-hueso",
  peligro: "bg-error text-white hover:opacity-90",
  exito: "bg-exito text-white hover:opacity-90",
};

export function Button({ variante = "primario", className = "", ...props }) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
      {...props}
    />
  );
}
