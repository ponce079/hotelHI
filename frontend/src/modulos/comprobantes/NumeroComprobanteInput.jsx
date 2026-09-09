// Input guiado para el número de comprobante (Factura, Nota de Crédito o
// Nota de Débito comparten el mismo formato AFIP: letra-4 dígitos-8
// dígitos). En vez de un texto libre que se valida después del submit, la
// estructura queda fija de entrada: letra restringida a las válidas, cada
// bloque numérico solo acepta dígitos y no deja escribir más allá de su
// longitud — el mensaje de error de abajo queda para lo que este input no
// puede impedir (dejar un bloque incompleto).
const LETRAS_VALIDAS = ["A", "B", "C", "E", "M", "T"];

function descomponer(value) {
  const [letra = "", bloque1 = "", bloque2 = ""] = (value || "").split("-");
  return { letra, bloque1, bloque2 };
}

export function NumeroComprobanteInput({ label, value, onChange, error, disabled = false, className = "" }) {
  const { letra, bloque1, bloque2 } = descomponer(value);

  function actualizar(campo, nuevo) {
    const partes = { letra, bloque1, bloque2, [campo]: nuevo };
    onChange(`${partes.letra}-${partes.bloque1}-${partes.bloque2}`);
  }

  return (
    <label className="flex flex-col gap-1.5 font-body text-sm">
      {label && <span className="text-[12px] text-tinta/70">{label}</span>}
      <div
        className={`flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-2 ${
          error ? "border-error" : "border-borde"
        } ${disabled ? "bg-hueso" : ""} ${className}`}
      >
        <select
          value={letra}
          onChange={(e) => actualizar("letra", e.target.value)}
          disabled={disabled}
          className="cursor-pointer border-0 bg-transparent text-[13.5px] text-tinta focus:outline-none disabled:cursor-not-allowed disabled:text-tinta/40"
        >
          <option value=""></option>
          {LETRAS_VALIDAS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-tinta/35">-</span>
        <input
          type="text"
          inputMode="numeric"
          value={bloque1}
          onChange={(e) => actualizar("bloque1", e.target.value.replace(/\D/g, "").slice(0, 4))}
          maxLength={4}
          placeholder="0001"
          disabled={disabled}
          className="w-12 border-0 bg-transparent text-[13.5px] text-tinta placeholder:text-tinta/35 focus:outline-none disabled:cursor-not-allowed disabled:text-tinta/40"
        />
        <span className="text-tinta/35">-</span>
        <input
          type="text"
          inputMode="numeric"
          value={bloque2}
          onChange={(e) => actualizar("bloque2", e.target.value.replace(/\D/g, "").slice(0, 8))}
          maxLength={8}
          placeholder="00012345"
          disabled={disabled}
          className="w-20 border-0 bg-transparent text-[13.5px] text-tinta placeholder:text-tinta/35 focus:outline-none disabled:cursor-not-allowed disabled:text-tinta/40"
        />
      </div>
      {error && <span className="text-[11.5px] text-error-texto">{error}</span>}
    </label>
  );
}
