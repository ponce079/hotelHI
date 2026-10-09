import { useQuery } from "@tanstack/react-query";
import { hoyEnHoraLocal, sumarDiasISO } from "../../lib/fechas";
import { consultarDisponibilidad } from "./ecommerce.api";

// Precio orientativo "Desde $ X / noche" para las tarjetas de habitación (rediseño).
// Es la tarifa más baja que devuelve /api/web/disponibilidad para UNA noche dentro de
// una semana y 1 persona: siempre se muestra junto con esa fecha, para que no se lea
// como un precio fijo. Si la consulta falla o el tipo no tiene lugar esa noche, la
// tarjeta simplemente no muestra precio.
export const DIAS_HASTA_REFERENCIA = 7;

export function fechaDeReferencia(hoy = hoyEnHoraLocal()) {
  return sumarDiasISO(hoy, DIAS_HASTA_REFERENCIA);
}

export function usePrecioReferencia() {
  const fechaDesde = fechaDeReferencia();
  const consulta = useQuery({
    queryKey: ["ecommerce", "precio-referencia", fechaDesde],
    queryFn: () => consultarDisponibilidad({ fechaDesde, fechaHasta: sumarDiasISO(fechaDesde, 1), adultos: 1, menores: 0 }),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const precios = new Map();
  for (const tipo of consulta.data?.tipos ?? []) {
    if (tipo.desdePorNoche != null) precios.set(tipo.tipoHabitacionId, tipo.desdePorNoche);
  }
  return { fecha: fechaDesde, precioDe: (tipoHabitacionId) => precios.get(tipoHabitacionId), hayPrecios: precios.size > 0 };
}
