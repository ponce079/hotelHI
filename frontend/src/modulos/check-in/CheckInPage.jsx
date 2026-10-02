import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { formatearFechaOperacion, hoyEnHoraLocal } from "../../lib/fechas";
import { buscarReservaParaCheckIn, listarLlegadas } from "./checkIn.api";
import { DEMORA_BUSQUEDA_LLEGADAS_MS } from "./checkInPantalla.constantes";
import { useDebounce } from "./usePersonaQueVuelve";
import { TablaLlegadas } from "./llegadas/TablaLlegadas";
import { CheckInReserva } from "./reserva/CheckInReserva";
import { CheckInWalkIn } from "./walkin/CheckInWalkIn";

// Check-in en una sola pantalla: "Llegadas de hoy" (con reserva) y "Walk-in".
//   ?codigo=<código>    abre esa reserva (desde el Inicio del Recepcionista).
//   ?habitacion=<nro>   abre el walk-in con esa habitación elegida si está libre (Panel de Habitaciones).
export function CheckInPage() {
  const { puede } = useSesion();
  const [searchParams] = useSearchParams();
  const codigo = searchParams.get("codigo") ?? "";
  const habitacionPreseleccionada = searchParams.get("habitacion") ?? "";
  const [pestana, setPestana] = useState(habitacionPreseleccionada ? "walkin" : "llegadas");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState(null); // { id, senia }
  // El walk-in queda montado desde la primera visita: cambiar de pestaña no pierde lo cargado.
  const [walkinVisitado, setWalkinVisitado] = useState(Boolean(habitacionPreseleccionada));
  const panelReserva = useRef(null);
  const q = useDebounce(busqueda.trim(), DEMORA_BUSQUEDA_LLEGADAS_MS);

  const todas = useQuery({ queryKey: ["check-in", "llegadas", ""], queryFn: () => listarLlegadas("") });
  const filtradas = useQuery({ queryKey: ["check-in", "llegadas", q], queryFn: () => listarLlegadas(q), enabled: Boolean(q) });
  const consulta = q ? filtradas : todas;

  // ?codigo=: se busca la reserva y se abre.
  const porCodigo = useQuery({
    queryKey: ["check-in", "por-codigo", codigo],
    queryFn: () => buscarReservaParaCheckIn({ codigo }),
    enabled: Boolean(codigo),
    retry: false,
  });
  useEffect(() => {
    if (porCodigo.data?.reserva && !seleccionada) setSeleccionada({ id: porCodigo.data.reserva.id, senia: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porCodigo.data]);

  if (!puede("gestionarCheckIn")) return <SinPermiso />;

  const seniaSeleccionada =
    seleccionada?.senia ?? todas.data?.reservas?.find((r) => r.id === seleccionada?.id)?.senia ?? null;
  const pestanaClase = (activa) =>
    `cursor-pointer rounded-full px-4 py-1.5 font-body text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-pino ${
      activa ? "bg-pino text-hueso" : "text-piedra hover:text-tinta"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Check-in</h1>
        <p className="font-body text-[14px] text-hueso/80">{formatearFechaOperacion(hoyEnHoraLocal())} · Recepción</p>
      </div>

      <div role="tablist" aria-label="Tipo de check-in" className="inline-flex w-fit gap-1 rounded-full bg-white p-1">
        <button type="button" role="tab" id="tab-llegadas" aria-selected={pestana === "llegadas"} aria-controls="panel-llegadas" onClick={() => setPestana("llegadas")} className={pestanaClase(pestana === "llegadas")}>
          Llegadas de hoy
          {todas.data && (
            <span className={`ml-2 rounded-full px-1.5 font-mono text-[11px] ${pestana === "llegadas" ? "bg-hueso/20" : "bg-hueso"}`}>{todas.data.reservas.length}</span>
          )}
        </button>
        <button type="button" role="tab" id="tab-walkin" aria-selected={pestana === "walkin"} aria-controls="panel-walkin" onClick={() => {
            setPestana("walkin");
            setWalkinVisitado(true);
          }} className={pestanaClase(pestana === "walkin")}>
          Walk-in
        </button>
      </div>

      <div role="tabpanel" id="panel-llegadas" aria-labelledby="tab-llegadas" hidden={pestana !== "llegadas"} className="flex flex-col gap-4">
        <TablaLlegadas
          busqueda={busqueda}
          onBuscar={setBusqueda}
          consulta={consulta}
          seleccionadaId={seleccionada?.id}
          onSeleccionar={(r) => {
            setSeleccionada({ id: r.id, senia: r.senia });
            setTimeout(() => panelReserva.current?.scrollIntoView?.({ block: "start" }), 0);
          }}
        />
        {codigo && porCodigo.isError && !seleccionada && (
          <p role="alert" className="text-[13px] text-error-texto">
            {porCodigo.error?.response?.data?.error ?? "No se encontró la reserva."}
          </p>
        )}
        <div ref={panelReserva}>
          {seleccionada ? (
            <CheckInReserva key={seleccionada.id} reservaId={seleccionada.id} senia={seniaSeleccionada} onVolver={() => setSeleccionada(null)} />
          ) : (
            <p className="rounded-lg border border-borde bg-white px-[22px] py-5 text-[13px] text-piedra">Elegí una llegada de la lista para empezar el check-in.</p>
          )}
        </div>
      </div>

      <div role="tabpanel" id="panel-walkin" aria-labelledby="tab-walkin" hidden={pestana !== "walkin"}>
        {walkinVisitado && <CheckInWalkIn habitacionPreseleccionada={habitacionPreseleccionada} />}
      </div>
    </div>
  );
}
