import { useEffect, useReducer, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useSesion } from "../../../lib/sesion";
import { formatearDiaCorto, hoyEnHoraLocal, sumarDiasISO } from "../../../lib/fechas";
import { cotizarReserva } from "../../reservas/reservas.api";
import { listarHabitacionesLibresAhora, registrarCheckInWalkIn } from "../checkIn.api";
import { estadoInicialWalkin, reducer } from "../checkInEstado";
import { faltantesParaConfirmar, listaY } from "../checkInReglas";
import { cuerpoWalkin } from "../checkInPayload";
import { useConfirmacionCheckIn } from "../useConfirmacionCheckIn";
import { SeccionHuespedes } from "../huespedes/SeccionHuespedes";
import { SeccionGarantia } from "../SeccionGarantia";
import { BarraCheckIn, resumenTotal } from "../BarraCheckIn";
import { ConfirmacionExitosa } from "../ConfirmacionExitosa";
import { EstadiaOcupacion } from "./EstadiaOcupacion";
import { HabitacionTarifa } from "./HabitacionTarifa";

// Walk-in: estadía y ocupación, habitación y tarifa, huéspedes y garantía en una sola pantalla.
// El total sale de /reservas/cotizar con todas las habitaciones (es el totalEsperado) y se envía
// sin huésped: el backend lo arma con el titular de la primera habitación.
export function CheckInWalkIn({ habitacionPreseleccionada = "" }) {
  const { usuario } = useSesion();
  const hoy = hoyEnHoraLocal();
  const [estado, dispatch] = useReducer(reducer, null, estadoInicialWalkin);
  const [confirmado, setConfirmado] = useState(null);
  const preseleccion = useRef(false);
  const fechaHasta = sumarDiasISO(hoy, estado.noches);
  const contexto = { fechaDesde: hoy, fechaHasta, huespedReserva: null };

  // Libres por habitación, con su ocupación y sin las ya elegidas para otra habitación.
  const libres = useQueries({
    queries: estado.habitaciones.map((h) => {
      const excluir = estado.habitaciones.filter((x) => x.clave !== h.clave && x.habitacionId).map((x) => x.habitacionId);
      return {
        queryKey: ["check-in", "libres", "walkin", h.clave, fechaHasta, h.adultos, h.menores, excluir.join(",")],
        queryFn: () => listarHabitacionesLibresAhora({ fechaHasta, adultos: h.adultos, menores: h.menores, excluir: excluir.join(",") }),
      };
    }),
  });

  // Tarifas que ofrecen las habitaciones disponibles (con sus condiciones).
  const planes = [];
  for (const consulta of libres)
    for (const habitacion of consulta.data?.habitaciones ?? [])
      for (const p of habitacion.planes ?? []) if (!planes.some((x) => x.codigo === p.codigo)) planes.push(p);
  const primerPlan = planes[0]?.codigo;
  useEffect(() => {
    if (!estado.planCodigo && primerPlan) dispatch({ tipo: "plan", codigo: primerPlan });
  }, [estado.planCodigo, primerPlan]);

  // ?habitacion=<numero>: se elige para la primera habitación si está libre.
  const libresPrimera = libres[0]?.data?.habitaciones;
  useEffect(() => {
    if (!habitacionPreseleccionada || preseleccion.current || !libresPrimera) return;
    preseleccion.current = true;
    const encontrada = libresPrimera.find((h) => h.numero === habitacionPreseleccionada);
    if (encontrada) dispatch({ tipo: "elegirHabitacion", clave: estado.habitaciones[0].clave, habitacion: encontrada });
  }, [habitacionPreseleccionada, libresPrimera, estado.habitaciones]);

  const elegidas = estado.habitaciones.every((h) => h.habitacionId);
  const ocupacion = estado.habitaciones.map((h) => ({ habitacionId: h.habitacionId, adultos: h.adultos, menores: h.menores }));
  const cotizacion = useQuery({
    queryKey: ["reservas", "cotizar", "walkin", hoy, fechaHasta, JSON.stringify(ocupacion)],
    queryFn: () => cotizarReserva({ fechaDesde: hoy, fechaHasta, habitaciones: ocupacion, canal: "RECEPCION" }),
    enabled: elegidas,
    retry: false,
  });
  const planCotizado = cotizacion.data?.planes?.find((p) => p.codigo === estado.planCodigo) ?? null;

  const { confirmar, panel, enviando, reiniciar } = useConfirmacionCheckIn({
    estado,
    dispatch,
    onExito: (reserva) => setConfirmado({ reserva, huespedes: estado.filas.length }),
    enviar: (totalEsperado) =>
      registrarCheckInWalkIn(
        cuerpoWalkin(estado, contexto, {
          operador: usuario,
          planTarifarioId: planCotizado.planTarifarioId,
          totalEsperado: totalEsperado ?? planCotizado.total,
        }),
      ),
  });

  if (confirmado) {
    return (
      <ConfirmacionExitosa
        reserva={confirmado.reserva}
        huespedes={confirmado.huespedes}
        accion="Nuevo walk-in"
        detalle="La reserva se creó en el mismo paso."
        onAccion={() => {
          setConfirmado(null);
          reiniciar();
          dispatch({ tipo: "reiniciar", estado: estadoInicialWalkin() });
        }}
      />
    );
  }

  const faltantes = faltantesParaConfirmar(estado, contexto);
  if (elegidas && cotizacion.isError)
    faltantes.unshift({ texto: cotizacion.error?.response?.data?.error ?? "No se pudo cotizar la estadía", campoId: "ci-tarifa" });
  else if (elegidas && cotizacion.isSuccess && estado.planCodigo && !planCotizado)
    faltantes.unshift({ texto: "La tarifa elegida no está disponible para estas habitaciones", campoId: "ci-tarifa" });
  const numeros = estado.habitaciones.filter((h) => h.numero).map((h) => h.numero);
  const resumen = [
    {
      clave: "hab",
      texto: numeros.length === 0 ? "Sin habitación elegida" : numeros.length === 1 ? `Hab. ${numeros[0]} · ${estado.habitaciones.find((h) => h.numero)?.tipo}` : `Hab. ${listaY(numeros)}`,
      fuerte: true,
    },
    { clave: "fechas", texto: `${formatearDiaCorto(hoy)} → ${formatearDiaCorto(fechaHasta)} · ${estado.noches} ${estado.noches === 1 ? "noche" : "noches"}` },
    { clave: "tarifa", texto: planes.find((p) => p.codigo === estado.planCodigo)?.nombre ?? "" },
    ...(planCotizado ? [resumenTotal(planCotizado.total)] : []),
  ];
  return (
    <div className="flex flex-col gap-4">
      <EstadiaOcupacion estado={estado} hoy={hoy} dispatch={dispatch} />
      <HabitacionTarifa estado={estado} libres={libres} planes={planes} dispatch={dispatch} />
      <SeccionHuespedes estado={estado} contexto={contexto} dispatch={dispatch} />
      <SeccionGarantia garantia={estado.garantia} dispatch={dispatch} fechaHasta={fechaHasta} />
      <BarraCheckIn
        resumen={resumen}
        faltantes={planCotizado || faltantes.length ? faltantes : [{ texto: "Calculando el total…", campoId: "ci-tarifa" }]}
        enviando={enviando}
        panel={panel}
        onConfirmar={() => faltantes.length === 0 && planCotizado && confirmar()}
        onConfirmarNuevoTotal={() => confirmar(panel.detalle.totalNuevo)}
      />
    </div>
  );
}
