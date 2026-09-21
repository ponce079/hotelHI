import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { CheckInConReserva } from "./CheckInConReserva";
import { CheckInWalkIn } from "./CheckInWalkIn";

export function CheckInPage() {
  const { puede } = useSesion();
  const [searchParams] = useSearchParams();
  // Panel de Habitaciones (HabitacionesPage.jsx) linkea acá con
  // ?habitacion=<numero> desde el "→ Iniciar check-in" de una tarjeta
  // libre: entra directo al modo walk-in con esa habitación preseleccionada
  // (ver CheckInWalkIn), en vez de arrancar en el modo "con reserva".
  const habitacionPreseleccionada = searchParams.get("habitacion") ?? "";
  // Inicio del Recepcionista (RecepcionistaInicio.jsx) linkea acá con
  // ?codigo=<codigoConfirmacion> desde el "→ Iniciar check-in" de una
  // llegada de hoy: entra en modo "con reserva" con la búsqueda ya
  // disparada (ver CheckInConReserva), sin tener que volver a tipear el
  // código a mano.
  const codigoPreseleccionado = searchParams.get("codigo") ?? "";
  const [modo, setModo] = useState(habitacionPreseleccionada ? "walkin" : "reserva");

  if (!puede("gestionarCheckIn")) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Check-in</h1>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          HU 43 a 47 — con reserva previa o walk-in, asignación de habitación y validación de garantía
        </p>
      </div>

      <div className="inline-flex w-fit gap-1 rounded-full bg-hueso p-1">
        <button
          type="button"
          onClick={() => setModo("reserva")}
          className={`cursor-pointer rounded-full px-4 py-1.5 font-body text-[13px] font-semibold transition-colors ${
            modo === "reserva" ? "bg-pino text-hueso" : "text-piedra hover:text-tinta"
          }`}
        >
          Con reserva
        </button>
        <button
          type="button"
          onClick={() => setModo("walkin")}
          className={`cursor-pointer rounded-full px-4 py-1.5 font-body text-[13px] font-semibold transition-colors ${
            modo === "walkin" ? "bg-pino text-hueso" : "text-piedra hover:text-tinta"
          }`}
        >
          Walk-in (sin reserva)
        </button>
      </div>

      {modo === "reserva" ? (
        <CheckInConReserva codigoPreseleccionado={codigoPreseleccionado} />
      ) : (
        <CheckInWalkIn habitacionPreseleccionada={habitacionPreseleccionada} />
      )}
    </div>
  );
}
