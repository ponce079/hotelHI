import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GarantiaFieldset } from "./GarantiaFieldset";
import { Tarjeta } from "./ui";
import { formatearPrecio } from "../../lib/moneda";
import { obtenerGarantiasReserva } from "../garantias/garantias.api";

// "Garantía para consumos": envuelve GarantiaFieldset (lo define el módulo de
// garantía). Una sola garantía por reserva. Si la reserva tiene seña, una línea
// informativa. Con `reservaId` consulta si la reserva dejó una tarjeta en
// garantía: en ese caso se preautoriza esa tarjeta sin volver a pedirla. El
// walk-in no tiene reserva previa, así que siempre pide tarjeta o depósito.
export function SeccionGarantia({ garantia, dispatch, senia, reservaId, fechaHasta }) {
  const medios = senia?.medios ?? [];
  const consulta = useQuery({
    queryKey: ["reservas", "garantia", reservaId],
    queryFn: () => obtenerGarantiasReserva(reservaId),
    enabled: Boolean(reservaId),
    retry: false,
    staleTime: 0,
  });
  const guardada = consulta.data?.reserva?.tieneTarjeta
    ? { marca: consulta.data.reserva.marca, ultimos4: consulta.data.reserva.ultimos4 }
    : null;

  // Con una tarjeta guardada, lo natural es preautorizar esa tarjeta: el medio por
  // defecto pasa a "Tarjeta crédito" (mientras el recepcionista no haya confirmado nada).
  useEffect(() => {
    if (guardada && !garantia.garantiaConfirmada && garantia.medioGarantia !== "Tarjeta crédito") {
      dispatch({ tipo: "garantia", cambios: { medioGarantia: "Tarjeta crédito" } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardada?.ultimos4, guardada?.marca]);

  return (
    <Tarjeta titulo="Garantía para consumos" id="ci-garantia">
      {medios.length > 0 && (
        <p className="mb-3 text-[13.5px] text-piedra">
          Pago anticipado registrado en la reserva:{" "}
          {medios.map((m) => m.referencia || `${m.medioPago} · ${formatearPrecio(m.importe)}`).join(" · ")}
        </p>
      )}
      {reservaId && consulta.isLoading ? (
        <p className="text-[13px] text-piedra">Consultando la garantía de la reserva…</p>
      ) : (
        <GarantiaFieldset
          // Si cambia lo que hay guardado, el fieldset arranca de cero con el modo correcto.
          key={guardada ? `${guardada.marca}-${guardada.ultimos4}` : "sin-tarjeta"}
          garantiaConfirmada={garantia.garantiaConfirmada}
          medioGarantia={garantia.medioGarantia}
          garantiaTarjeta={garantia.garantiaTarjeta}
          tarjetaGuardada={guardada}
          fechaHasta={fechaHasta}
          onCambiar={(cambios) => dispatch({ tipo: "garantia", cambios })}
        />
      )}
    </Tarjeta>
  );
}
