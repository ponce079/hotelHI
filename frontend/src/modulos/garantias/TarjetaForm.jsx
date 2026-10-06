import { Input } from "../../componentes/Input";
import { formatearNumeroTarjeta, formatearVencimiento, soloDigitos, TARJETAS_DE_PRUEBA } from "./garantias.constantes";

// Los 4 datos de una tarjeta de crédito. Compartido por el paso "Garantía" de
// la reserva y por la garantía del check-in. Solo muestra y edita: el estado y
// la validación viven en quien lo usa. Nada se guarda acá.
export function TarjetaForm({ tarjeta, errores = {}, mostrarErrores = false, deshabilitado = false, onChange }) {
  const err = (campo) => (mostrarErrores ? errores[campo] : undefined);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label="Número de tarjeta *"
        value={tarjeta.numero}
        error={err("numero")}
        disabled={deshabilitado}
        inputMode="numeric"
        autoComplete="off"
        placeholder={TARJETAS_DE_PRUEBA.aprobada}
        onChange={(e) => onChange("numero", formatearNumeroTarjeta(e.target.value))}
      />
      <Input
        label="Titular *"
        value={tarjeta.titular}
        error={err("titular")}
        disabled={deshabilitado}
        autoComplete="off"
        placeholder="Como figura en la tarjeta"
        onChange={(e) => onChange("titular", e.target.value)}
      />
      <Input
        label="Vencimiento (MM/AA) *"
        value={tarjeta.vencimiento}
        error={err("vencimiento")}
        disabled={deshabilitado}
        inputMode="numeric"
        autoComplete="off"
        placeholder="12/29"
        onChange={(e) => onChange("vencimiento", formatearVencimiento(e.target.value))}
      />
      <Input
        label="Código de seguridad *"
        type="password"
        value={tarjeta.cvv}
        error={err("cvv")}
        disabled={deshabilitado}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="•••"
        onChange={(e) => onChange("cvv", soloDigitos(e.target.value))}
      />
    </div>
  );
}
