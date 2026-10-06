import { useQuery } from "@tanstack/react-query";
import { obtenerCierrePrevio } from "./garantias.api";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const REGLA_TEXTO = {
  PRIMERA_NOCHE: "se cobra la primera noche",
  TOTAL_NO_REEMBOLSABLE: "tarifa no reembolsable: se cobra la estadía completa",
  TOTAL_ESTADIA: "se cobra la estadía completa",
};

// Líneas ya redactadas a partir de la liquidación del backend. Pura (sin
// React) para poder probarla sin montar nada.
export function lineasDeCierre(c) {
  const dinero = (n) => FORMATO_MONEDA.format(n);
  if (c.estadoCobro === "SIN_CARGO") {
    return c.devuelto > 0
      ? [`Sin cargo. Se devuelven ${dinero(c.devuelto)} de lo ya pagado.`]
      : ["Sin cargo: no se cobra ni se devuelve nada."];
  }
  const lineas = [`Penalidad: ${dinero(c.monto)} — ${REGLA_TEXTO[c.regla] ?? c.regla}.`];
  if (c.retenido > 0) lineas.push(`Se retienen ${dinero(c.retenido)} de lo ya pagado.`);
  if (c.devuelto > 0) lineas.push(`Se devuelven ${dinero(c.devuelto)} al huésped.`);
  if (c.aCobrarATarjeta > 0) {
    const tarjeta = c.tarjeta ? `${c.tarjeta.marca} ****${c.tarjeta.ultimos4}` : "la tarjeta en garantía";
    lineas.push(`Se cobran ${dinero(c.aCobrarATarjeta)} a ${tarjeta}.`);
  }
  if (c.sinCobrar > 0) {
    lineas.push(`Quedan ${dinero(c.sinCobrar)} pendientes de cobro: la reserva no tiene tarjeta en garantía.`);
  }
  if (c.estadoCobro === "RETENIDO" && c.retenido > 0 && c.devuelto === 0 && c.aCobrarATarjeta === 0) {
    lineas.push("No se cobra nada más ni se devuelve nada.");
  }
  return lineas;
}

// Aviso que se muestra ANTES de confirmar una cancelación o un no-show.
export function CierrePrevio({ reservaId, tipo }) {
  const consulta = useQuery({
    queryKey: ["reservas", "cierre-previo", reservaId, tipo],
    queryFn: () => obtenerCierrePrevio(reservaId, tipo),
    enabled: Boolean(reservaId),
    staleTime: 0,
    gcTime: 0,
  });

  if (consulta.isLoading) {
    return <p className="mb-3 rounded-md border border-borde bg-hueso px-4 py-2.5 text-[12.5px] text-piedra">Calculando la penalidad…</p>;
  }
  if (consulta.isError) {
    return (
      <p className="mb-3 rounded-md border border-error bg-error-suave px-4 py-2.5 text-[12.5px] text-error-texto">
        {consulta.error?.response?.data?.error ?? "No se pudo calcular la penalidad."}
      </p>
    );
  }

  const c = consulta.data;
  const sinCargo = c.estadoCobro === "SIN_CARGO";
  const hayDeuda = c.sinCobrar > 0;
  const tono = sinCargo
    ? "border-pino-300 bg-pino-100 text-pino-700"
    : hayDeuda
      ? "border-error bg-error-suave text-error-texto"
      : "border-laton-300 bg-laton-100 text-laton-700";
  return (
    <div role="status" className={`mb-3 flex flex-col gap-1 rounded-md border px-4 py-2.5 text-[12.5px] ${tono}`}>
      {lineasDeCierre(c).map((linea) => (
        <p key={linea}>{linea}</p>
      ))}
    </div>
  );
}
