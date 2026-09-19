import { ShieldCheck } from "lucide-react";
import { Select } from "../../componentes/Select";
import { MEDIOS_GARANTIA } from "./checkIn.constantes";

// HU-46 — validación de pago/garantía. Común a check-in con reserva previa
// (CheckInConReserva) y walk-in (CheckInWalkIn): mismo bloqueo, mismos
// campos, así que se extrae en vez de duplicarlo en los dos. La validación
// real contra una pasarela de pago queda fuera de alcance (limitación ya
// documentada en el backlog) — esto es la confirmación manual mockeada.
export function GarantiaFieldset({ garantiaConfirmada, medioGarantia, onCambiar }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-hueso px-5 py-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-tinta">
        <ShieldCheck size={16} className="text-pino" />
        Validación de pago / garantía
      </div>
      <Select
        label="Medio de garantía *"
        value={medioGarantia}
        onChange={(e) => onCambiar({ medioGarantia: e.target.value })}
      >
        {MEDIOS_GARANTIA.map((medio) => (
          <option key={medio} value={medio}>
            {medio}
          </option>
        ))}
      </Select>
      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta">
        <input
          type="checkbox"
          checked={garantiaConfirmada}
          onChange={(e) => onCambiar({ garantiaConfirmada: e.target.checked })}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-pino"
        />
        <span>
          Confirmo que el huésped presentó el medio de garantía elegido.
          <span className="mt-0.5 block text-[11.5px] text-piedra">
            No hay integración real con una pasarela de pago en este sprint — es una confirmación manual del
            mostrador.
          </span>
        </span>
      </label>
    </div>
  );
}
