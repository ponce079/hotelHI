import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../componentes/Button";
import { formatearDiaLargo } from "../../../lib/fechas";
import { formatearPrecio } from "../../../lib/moneda";
import { listarHabitacionesLibresAhora } from "../checkIn.api";
import { HORA_CHECKIN, HORA_CHECKOUT } from "../checkInPantalla.constantes";
import { etiquetaOcupacion } from "../checkInReglas";
import { Chip, Dato, Tarjeta } from "../ui";

export function condicionesDelPlan(plan) {
  if (!plan) return "";
  if (!plan.reembolsable) return "Sin cambios ni devolución";
  return plan.horasCancelacionSinCargo ? `Cancelación sin cargo hasta ${plan.horasCancelacionSinCargo} h antes` : "Cancelación sin cargo";
}

// Otras habitaciones libres del mismo tipo para esta ocupación, sin las de la reserva.
function CambioHabitacion({ estado, reserva, habitacion, dispatch, onCerrar }) {
  // Se excluyen todas las habitaciones de la reserva (la reservada se ofrece aparte, para volver).
  const excluir = [...new Set(estado.habitaciones.flatMap((h) => [h.habitacionId, h.habitacionIdAnterior]))];
  const libres = useQuery({
    queryKey: ["check-in", "libres", "cambio", habitacion.tipoHabitacionId, habitacion.adultos, habitacion.menores, excluir.join(",")],
    queryFn: () =>
      listarHabitacionesLibresAhora({
        fechaHasta: String(reserva.fechaHasta).slice(0, 10),
        tipoHabitacionId: habitacion.tipoHabitacionId,
        adultos: habitacion.adultos,
        menores: habitacion.menores,
        excluir: excluir.join(","),
      }),
  });
  const opciones = libres.data?.habitaciones ?? [];
  return (
    <div className="mt-2 flex flex-wrap gap-2.5 rounded-[12px] border border-borde bg-hueso px-3.5 py-3">
      {libres.isLoading && <span className="text-[13px] text-piedra">Buscando habitaciones libres…</span>}
      {!libres.isLoading && opciones.length === 0 && (
        <span className="text-[13px] text-piedra">No hay otras habitaciones libres de este tipo para esta ocupación.</span>
      )}
      {habitacion.habitacionId !== habitacion.habitacionIdAnterior && (
        <button
          type="button"
          onClick={() => {
            dispatch({ tipo: "cambiarHabitacion", clave: habitacion.clave, habitacion: { id: habitacion.habitacionIdAnterior, numero: habitacion.numeroAnterior, piso: habitacion.pisoAnterior, capacidad: habitacion.capacidadAnterior } });
            onCerrar();
          }}
          className="cursor-pointer rounded-md border border-borde bg-white px-3 py-2 text-left hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino"
        >
          <b>{habitacion.numeroAnterior}</b> <span className="text-[12.5px] text-piedra">Volver a la reservada</span>
        </button>
      )}
      {opciones.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => {
            dispatch({ tipo: "cambiarHabitacion", clave: habitacion.clave, habitacion: h });
            onCerrar();
          }}
          className="cursor-pointer rounded-md border border-borde bg-white px-3 py-2 text-left hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino"
        >
          <b>{h.numero}</b> <span className="text-[12.5px] text-piedra">Piso {h.piso} · capacidad {h.capacidad}</span>
        </button>
      ))}
    </div>
  );
}

// Resumen no editable de la reserva (precio congelado) y una tarjeta por habitación.
export function ResumenReserva({ estado, reserva, dispatch }) {
  const [cambiando, setCambiando] = useState(null);
  const adultos = estado.habitaciones.reduce((a, h) => a + h.adultos, 0);
  const menores = estado.habitaciones.reduce((a, h) => a + h.menores, 0);
  const adultosReservados = reserva.habitaciones.reduce((a, h) => a + h.adultos, 0);
  const menoresReservados = reserva.habitaciones.reduce((a, h) => a + h.menores, 0);
  const cambioOcupacion = adultos !== adultosReservados || menores !== menoresReservados;
  const diferencia = estado.totalVigente - Number(reserva.totalEstimadoAlojamiento ?? 0);
  return (
    <Tarjeta
      titulo={`Reserva ${reserva.codigoConfirmacion}`}
      accion={reserva.cantidadHabitaciones > 1 ? <Chip>Reserva de {reserva.cantidadHabitaciones} habitaciones</Chip> : null}
    >
      <div className="grid gap-x-[22px] gap-y-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Dato titulo="Entrada" valor={formatearDiaLargo(reserva.fechaDesde)} detalle={`desde las ${HORA_CHECKIN}`} />
        <Dato
          titulo="Salida"
          valor={formatearDiaLargo(reserva.fechaHasta)}
          detalle={`hasta las ${HORA_CHECKOUT} · ${reserva.noches} ${reserva.noches === 1 ? "noche" : "noches"}`}
        />
        <Dato titulo="Tarifa" valor={reserva.planTarifario?.nombre ?? "—"} detalle={condicionesDelPlan(reserva.planTarifario)} />
        <Dato
          titulo="Ocupación"
          valor={etiquetaOcupacion(adultos, menores)}
          detalle={cambioOcupacion ? `Reservado: ${etiquetaOcupacion(adultosReservados, menoresReservados)}` : "Menores de 0 a 12 años sin cargo"}
        />
        <Dato
          titulo="Total de la estadía"
          grande
          valor={formatearPrecio(estado.totalVigente)}
          detalle={diferencia ? `Recotizado: ${diferencia > 0 ? "+" : ""}${formatearPrecio(diferencia)}` : "Precio final, IVA incluido"}
        />
      </div>
      {estado.habitaciones.map((h) => (
        <div key={h.clave} id={`ci-hab-${h.clave}`} tabIndex={-1} className="focus:outline-none">
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[12px] border border-pino-200 bg-pino-100/60 px-4 py-3">
            <span className="font-heading text-[30px] font-semibold leading-none text-pino-800">{h.numero}</span>
            <div className="min-w-[200px] flex-1">
              <b>
                {h.tipo} · {etiquetaOcupacion(h.adultos, h.menores)}
              </b>{" "}
              {h.habitacionId !== h.habitacionIdAnterior && <Chip variante="aviso">Cambiada (era la {h.numeroAnterior})</Chip>}
              <br />
              <span className="text-[13px] text-piedra">
                Piso {h.piso} · capacidad {h.capacidad}
              </span>
              {h.capacidad != null && h.adultos + h.menores > h.capacidad && (
                <p className="text-[13px] text-error-texto">La ocupación supera la capacidad: cambiá de habitación.</p>
              )}
              {h.errorServidor && (
                <p role="alert" className="text-[13px] text-error-texto">
                  {h.errorServidor}
                </p>
              )}
            </div>
            <Button variante="secundario" aria-expanded={cambiando === h.clave} onClick={() => setCambiando(cambiando === h.clave ? null : h.clave)}>
              {cambiando === h.clave ? "Cerrar" : "Cambiar habitación"}
            </Button>
          </div>
          {cambiando === h.clave && (
            <CambioHabitacion estado={estado} reserva={reserva} habitacion={h} dispatch={dispatch} onCerrar={() => setCambiando(null)} />
          )}
        </div>
      ))}
      <p className="mt-3 text-[12.5px] text-piedra">
        Precio congelado de la reserva. Fechas y tarifa se cambian desde Reservas. El cambio de habitación es solo a otra libre del mismo
        tipo y se aplica al confirmar.
      </p>
    </Tarjeta>
  );
}
