import { Check } from "lucide-react";
import { Button } from "../../componentes/Button";
import { formatearDiaLargo } from "../../lib/fechas";
import { HORA_CHECKOUT } from "./checkInPantalla.constantes";
import { listaY } from "./checkInReglas";

// Panel de éxito: habitación(es), huéspedes registrados y salida.
export function ConfirmacionExitosa({ reserva, huespedes, accion, onAccion, detalle }) {
  const numeros = reserva.habitaciones.map((h) => h.numero);
  return (
    <div role="status" className="flex flex-wrap items-center gap-[18px] rounded-lg border border-pino-300 bg-pino-100 p-[22px]">
      <span aria-hidden="true" className="grid h-[46px] w-[46px] place-items-center rounded-full bg-pino text-hueso">
        <Check size={24} />
      </span>
      <div className="min-w-[240px] flex-1">
        <h2 className="font-heading text-[20px] font-semibold text-pino-800">
          Check-in confirmado · {numeros.length > 1 ? `Habitaciones ${listaY(numeros)}` : `Habitación ${numeros[0]}`}
        </h2>
        <p>
          {huespedes} {huespedes === 1 ? "huésped registrado" : "huéspedes registrados"} · salida {formatearDiaLargo(reserva.fechaHasta)} hasta las{" "}
          {HORA_CHECKOUT}. {detalle}
        </p>
      </div>
      <Button variante="secundario" onClick={onAccion}>
        {accion}
      </Button>
    </div>
  );
}
