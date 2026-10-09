import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "../../componentes/Button";
import { FilterBar } from "../../componentes/FilterBar";
import { PageHeader } from "../../componentes/PageHeader";
import { idPestana, Pestanas } from "../../componentes/Pestanas";
import { SinPermiso } from "../../componentes/SinPermiso";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { useDebounce } from "../../lib/identificacion/useIdentificarPersona";
import { useSesion } from "../../lib/sesion";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";
import { GarantiasARevisar } from "./GarantiasARevisar";
import { IndicadoresSalidas } from "./IndicadoresSalidas";
import {
  calcularIndicadores,
  filtrarPorVista,
  ordenarSalidas,
  VISTAS,
  vistaPorDefecto,
  vistaValida,
} from "./listadoCheckOut.helpers";
import { TablaSalidas } from "./TablaSalidas";

const DEMORA_BUSQUEDA_MS = 300;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const CLASE_BUSCADOR =
  "h-10 w-full rounded-md border border-borde bg-white pl-8 pr-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40";

// Punto de entrada del check-out: las reservas que hoy tienen al huésped alojado ("En curso"). Elegir una lleva al
// flujo completo de esa reserva (/check-out/:reservaId).
//   ?vista=hoy|vencidas|todas  pestaña activa (por defecto Vencidas si hay, si no Salen hoy).
export function CheckOutPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verCheckOut");
  const puedeGestionar = puede("gestionarCheckOut");
  const [searchParams, setSearchParams] = useSearchParams();
  const [busqueda, setBusqueda] = useState("");
  const q = useDebounce(busqueda.trim(), DEMORA_BUSQUEDA_MS);
  const hoy = hoyEnHoraLocal();

  // Sin búsqueda: es la misma consulta (y la misma caché) que el contador del menú. Los indicadores y los
  // contadores de las pestañas salen siempre de ella.
  const todas = useQuery({
    queryKey: ["reservas", "check-out", ""],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO }),
    enabled: puedeVer,
  });
  const filtradas = useQuery({
    queryKey: ["reservas", "check-out", q],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO, q }),
    enabled: puedeVer && Boolean(q),
  });
  const consulta = q ? filtradas : todas;

  const indicadores = useMemo(() => calcularIndicadores(todas.data, hoy), [todas.data, hoy]);
  const vista = vistaValida(searchParams.get("vista")) ?? vistaPorDefecto(indicadores?.vencidas ?? 0);
  const filas = useMemo(
    () => (consulta.data ? filtrarPorVista(ordenarSalidas(consulta.data, hoy), vista, hoy) : []),
    [consulta.data, vista, hoy],
  );

  if (!puedeVer) return <SinPermiso />;

  const pestanas = VISTAS.map((v) => ({
    ...v,
    cantidad: indicadores ? { hoy: indicadores.salenHoy, vencidas: indicadores.vencidas, todas: indicadores.enCasa }[v.valor] : undefined,
  }));

  function cambiarVista(valor) {
    const params = new URLSearchParams(searchParams);
    params.set("vista", valor);
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader titulo="Check-out" subtitulo="Salidas del día, vencidas y estadías en curso." />

      <IndicadoresSalidas indicadores={indicadores} />

      <GarantiasARevisar habilitado={puedeVer} />

      <div className="min-w-0 overflow-hidden rounded-lg border border-borde bg-white">
        <Pestanas etiqueta="Salidas" idBase="checkout" pestanas={pestanas} activa={vista} onCambiar={cambiarVista} />

        <FilterBar incrustada>
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} strokeWidth={1.6} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
            <input
              type="search"
              aria-label="Buscar estadías"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Código, huésped, documento o habitación"
              className={CLASE_BUSCADOR}
            />
          </div>
          <span className="ml-auto text-[13px] font-semibold text-piedra" aria-live="polite">
            {consulta.data ? plural(filas.length, "estadía", "estadías") : ""}
          </span>
        </FilterBar>

        <div role="tabpanel" id="checkout-panel" aria-labelledby={idPestana("checkout", vista)}>
          {consulta.isError ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="m-0 text-sm text-error-texto">
                {consulta.error?.response?.data?.error ?? "No se pudieron cargar las estadías en curso."}
              </p>
              <Button variante="secundario" onClick={() => consulta.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : (
            <TablaSalidas
              vista={vista}
              filas={filas}
              cargando={consulta.isLoading}
              hoy={hoy}
              busqueda={q}
              puedeGestionar={puedeGestionar}
            />
          )}
        </div>
      </div>
    </div>
  );
}
