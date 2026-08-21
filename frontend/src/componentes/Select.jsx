export function Select({ label, error, children, className = "", ...props }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label && <span className="font-semibold text-tinta">{label}</span>}
      <select
        className={`cursor-pointer rounded-md border px-3 py-2 text-sm text-tinta bg-white focus:outline-none focus:ring-2 focus:ring-pino/40 ${
          error ? "border-error" : "border-borde"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-error">{error}</span>}
    </label>
  );
}
