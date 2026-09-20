import { useState } from "react";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { CheckInConReserva } from "./CheckInConReserva";
import { CheckInWalkIn } from "./CheckInWalkIn";

export function CheckInPage() {
  const { puede } = useSesion();
  const [modo, setModo] = useState("reserva");

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

      {modo === "reserva" ? <CheckInConReserva /> : <CheckInWalkIn />}
    </div>
  );
}
