import { useState } from "react";
import { Select } from "../../componentes/Select";
import { Input } from "../../componentes/Input";
import { PAISES_OCUPANTES, buscarPaisOcupante } from "./ocupantesUbicacion";

export function PaisDocumentoReserva({ value = "", onChange, onBlur, error }) {
  const [manual, setManual] = useState(Boolean(value && !buscarPaisOcupante(value)));
  return (
    <div className="space-y-2">
      <Select
        label="País emisor del documento *"
        value={manual ? "__otro__" : buscarPaisOcupante(value)?.codigo || ""}
        error={!manual ? error : undefined}
        onBlur={onBlur}
        onChange={(e) => {
          setManual(e.target.value === "__otro__");
          onChange(e.target.value === "__otro__" ? "" : e.target.value);
        }}
      >
        <option value="">Seleccionar país</option>
        {PAISES_OCUPANTES.map((p) => (
          <option key={p.codigo} value={p.codigo}>
            {p.nombre}
          </option>
        ))}
        <option value="__otro__">Otro país</option>
      </Select>
      {manual && (
        <Input
          label="Nombre del país emisor *"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          error={error}
        />
      )}
    </div>
  );
}
