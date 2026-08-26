export function Select({ label, error, children, className = "", ...props }) {
  return (
    <label className="flex flex-col gap-1.5 font-body text-sm">
      {label && <span className="text-[12px] text-tinta/70">{label}</span>}
      <select
        className={`cursor-pointer rounded-md border px-3 py-2 text-[13.5px] text-tinta bg-white focus:outline-none focus:ring-2 focus:ring-pino/40 ${
          error ? "border-error" : "border-borde"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-[11.5px] text-error-texto">{error}</span>}
    </label>
  );
}
