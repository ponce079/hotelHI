import { DoorOpen } from "lucide-react";
import { Button } from "../../componentes/Button";
import { formatearFechaSinHora } from "../../lib/fechas";

function CampoResumen({ label, valor }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-piedra">{label}</p>
      <p className="mt-0.5 text-[14.5px] text-tinta">{valor}</p>
    </div>
  );
}

// Panel fijo de la columna derecha de Check-in (con reserva) — ancho fijo,
// no se achica ni se estira con el contenido del formulario a su lado.
export function PanelResumenCheckIn({
  reserva,
  garantiaConfirmada,
  medioGarantia,
  puedeConfirmar,
  cargando,
  onConfirmar,
  motivosBloqueo = [],
}) {
  return (
    <aside className="flex flex-[0_0_360px] flex-col overflow-hidden rounded-lg border border-borde bg-white">
      <div className="bg-laton-700 px-[26px] py-5">
        <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-laton-100">Resumen</p>
        <p className="mt-1 font-heading text-[19px] font-bold text-hueso">Check-in en curso</p>
      </div>
      <div className="flex flex-1 flex-col gap-[18px] px-6 py-[22px]">
        <CampoResumen label="Huésped" valor={reserva?.huesped?.nombre ?? "—"} />
        <CampoResumen
          label="Estadía"
          valor={reserva ? `${formatearFechaSinHora(reserva.fechaDesde)} → ${formatearFechaSinHora(reserva.fechaHasta)}` : "—"}
        />
        <CampoResumen
          label="Habitación"
          valor={reserva ? reserva.habitaciones.map((h) => h.numero).join(", ") : "—"}
        />
        <CampoResumen label="Garantía de pago" valor={garantiaConfirmada ? medioGarantia : "Pendiente"} />
      </div>
      <div className="px-6 pb-6">
        {motivosBloqueo.length > 0 && !cargando && (
          <div
            id="check-in-pendientes"
            role="status"
            className="mb-4 rounded-md border border-borde bg-hueso p-3 text-sm"
          >
            <p className="font-semibold">Para habilitar el check-in:</p>
            <ul className="mt-2 list-disc space-y-2 pl-4">
              {motivosBloqueo.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          </div>
        )}
        <Button
          icono={DoorOpen}
          className="w-full justify-center"
          aria-describedby={motivosBloqueo.length > 0 && !cargando ? "check-in-pendientes" : undefined}
          cargando={cargando}
          disabled={!puedeConfirmar}
          onClick={onConfirmar}
        >
          Confirmar check-in
        </Button>
      </div>
    </aside>
  );
}
