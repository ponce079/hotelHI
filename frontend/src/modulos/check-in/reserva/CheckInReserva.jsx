import { useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSesion } from "../../../lib/sesion";
import { formatearDiaCorto } from "../../../lib/fechas";
import { reintentarLecturaEstadia } from "../../estadia/recuperacionEstadia";
import { buscarReservaParaCheckIn, confirmarCheckInConReserva, listarOcupantes } from "../checkIn.api";
import { estadoInicialReserva, reducer } from "../checkInEstado";
import { faltantesParaConfirmar, listaY } from "../checkInReglas";
import { cuerpoConfirmarReserva } from "../checkInPayload";
import { useConfirmacionCheckIn } from "../useConfirmacionCheckIn";
import { SeccionHuespedes } from "../huespedes/SeccionHuespedes";
import { SeccionGarantia } from "../SeccionGarantia";
import { BarraCheckIn, resumenTotal } from "../BarraCheckIn";
import { ConfirmacionExitosa } from "../ConfirmacionExitosa";
import { ResumenReserva } from "./ResumenReserva";
import { Tarjeta } from "../ui";

function FormularioReserva({ reserva, ocupantes, senia, onExito }) {
  const { usuario } = useSesion();
  const [estado, dispatch] = useReducer(reducer, null, () => estadoInicialReserva(reserva, ocupantes));
  const contexto = { fechaDesde: reserva.fechaDesde, fechaHasta: reserva.fechaHasta, huespedReserva: reserva.huesped };
  const { confirmar, panel, enviando } = useConfirmacionCheckIn({
    estado,
    dispatch,
    onExito: (confirmada) => onExito({ reserva: confirmada, huespedes: estado.filas.length }),
    enviar: (totalEsperado) =>
      confirmarCheckInConReserva(reserva.id, cuerpoConfirmarReserva(estado, contexto, { operador: usuario, totalEsperado })),
  });

  const faltantes = faltantesParaConfirmar(estado, contexto);
  const numeros = estado.habitaciones.map((h) => h.numero);
  const resumen = [
    { clave: "hab", texto: numeros.length > 1 ? `Hab. ${listaY(numeros)}` : `Hab. ${numeros[0]} · ${estado.habitaciones[0].tipo}`, fuerte: true },
    { clave: "fechas", texto: `${formatearDiaCorto(reserva.fechaDesde)} → ${formatearDiaCorto(reserva.fechaHasta)} · ${reserva.noches} ${reserva.noches === 1 ? "noche" : "noches"}` },
    { clave: "tarifa", texto: reserva.planTarifario?.nombre ?? "" },
    resumenTotal(estado.totalVigente),
  ];
  return (
    <div className="flex flex-col gap-4">
      <ResumenReserva estado={estado} reserva={reserva} dispatch={dispatch} />
      <SeccionHuespedes estado={estado} contexto={contexto} dispatch={dispatch} />
      <SeccionGarantia garantia={estado.garantia} dispatch={dispatch} senia={senia} reservaId={reserva.id} fechaHasta={reserva.fechaHasta} />
      <BarraCheckIn
        resumen={resumen}
        faltantes={faltantes}
        enviando={enviando}
        panel={panel}
        onConfirmar={() => faltantes.length === 0 && confirmar()}
        onConfirmarNuevoTotal={() => {
          dispatch({ tipo: "total", valor: panel.detalle.totalNuevo });
          confirmar(panel.detalle.totalNuevo);
        }}
      />
    </div>
  );
}

// Check-in de una reserva de la lista de llegadas: carga la reserva y sus fichas Previstas.
export function CheckInReserva({ reservaId, senia, onVolver }) {
  // El resultado vive acá: al recargarse la reserva (ya En curso) el panel de éxito se mantiene.
  const [confirmado, setConfirmado] = useState(null);
  const reserva = useQuery({
    queryKey: ["check-in", "reserva", reservaId],
    queryFn: () => buscarReservaParaCheckIn({ id: reservaId }),
  });
  const ocupantes = useQuery({
    queryKey: ["ocupantes", reservaId],
    queryFn: () => listarOcupantes(reservaId),
    retry: reintentarLecturaEstadia,
  });
  if (confirmado) {
    return (
      <ConfirmacionExitosa
        reserva={confirmado.reserva}
        huespedes={confirmado.huespedes}
        accion="Volver a las llegadas"
        onAccion={onVolver}
        detalle="Entregá las tarjetas llave."
      />
    );
  }
  if (reserva.isLoading || ocupantes.isLoading) return <Tarjeta><p className="text-[13px] text-piedra">Cargando la reserva…</p></Tarjeta>;
  if (reserva.isError || ocupantes.isError) {
    return (
      <Tarjeta>
        <p role="alert" className="text-[13px] text-error-texto">
          {(reserva.error ?? ocupantes.error)?.response?.data?.error ?? "No se pudo cargar la reserva."}
        </p>
      </Tarjeta>
    );
  }
  if (!reserva.data.puedeIniciarCheckIn) {
    return (
      <Tarjeta titulo={`Reserva ${reserva.data.reserva.codigoConfirmacion}`}>
        <p className="rounded-md border border-laton-300 bg-laton-100 px-4 py-2.5 text-[13.5px] text-laton-700">{reserva.data.motivoBloqueo}</p>
      </Tarjeta>
    );
  }
  return <FormularioReserva key={reservaId} reserva={reserva.data.reserva} ocupantes={ocupantes.data} senia={senia} onExito={setConfirmado} />;
}
