import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, TriangleAlert } from "lucide-react";
import { Button } from "../../componentes/Button";
import { FilterBar } from "../../componentes/FilterBar";
import { PageHeader } from "../../componentes/PageHeader";
import { idPestana, Pestanas } from "../../componentes/Pestanas";
import { SinPermiso } from "../../componentes/SinPermiso";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useDebounce } from "../../lib/identificacion/useIdentificarPersona";
import { buscarReservaParaCheckIn, listarLlegadas } from "./checkIn.api";
import { DEMORA_BUSQUEDA_LLEGADAS_MS } from "./checkInPantalla.constantes";
import { IndicadoresLlegadas } from "./llegadas/IndicadoresLlegadas";
import { calcularIndicadores, VISTAS, vistaValida } from "./llegadas/llegadasHelpers";
import { TablaLlegadas } from "./llegadas/TablaLlegadas";
import { CheckInReserva } from "./reserva/CheckInReserva";
import { CheckInWalkIn } from "./walkin/CheckInWalkIn";

// Campo de cada vista en la respuesta de GET /check-in/llegadas.
const CAMPO_VISTA = { pendientes: "reservas", atrasadas: "atrasadas", ingresadas: "ingresadasHoy" };

const CLASE_BUSCADOR =
  "h-10 w-full rounded-md border border-borde bg-white pl-8 pr-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Check-in en una sola pantalla: llegadas del día, llegadas atrasadas, ingresadas hoy y, desde el botón, el walk-in.
//   ?vista=pendientes|atrasadas|ingresadas  pestaña activa (por defecto, pendientes de hoy).
//   ?codigo=<código>    abre esa reserva (desde el Inicio del Recepcionista).
//   ?habitacion=<nro>   abre el walk-in con esa habitación elegida si está libre (Panel de Habitaciones).
export function CheckInPage() {
  const { puede } = useSesion();
  const [searchParams, setSearchParams] = useSearchParams();
  const codigo = searchParams.get("codigo") ?? "";
  const habitacionPreseleccionada = searchParams.get("habitacion") ?? "";
  const vista = vistaValida(searchParams.get("vista"));
  const [walkin, setWalkin] = useState(Boolean(habitacionPreseleccionada));
  // El walk-in queda montado desde la primera visita: volver a las llegadas no pierde lo cargado.
  const [walkinVisitado, setWalkinVisitado] = useState(Boolean(habitacionPreseleccionada));
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState(null); // { id, senia }
  const panelReserva = useRef(null);
  const q = useDebounce(busqueda.trim(), DEMORA_BUSQUEDA_LLEGADAS_MS);
  const hoy = hoyEnHoraLocal();

  // Sin búsqueda: es la misma consulta (y la misma caché) que el contador del menú. Los indicadores salen siempre de ella.
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

  const datos = todas.data;
  const seniaSeleccionada =
    seleccionada?.senia ??
    [...(datos?.reservas ?? []), ...(datos?.atrasadas ?? [])].find((r) => r.id === seleccionada?.id)?.senia ??
    null;
  const indicadores = calcularIndicadores(datos, hoy);
  const filas = consulta.data?.[CAMPO_VISTA[vista]] ?? [];
  const pestanas = VISTAS.map((v) => ({ ...v, cantidad: datos ? (datos[CAMPO_VISTA[v.valor]] ?? []).length : undefined }));
  const pendientesNoShow = datos?.pendientesNoShow ?? 0;
  const puedeGestionarNoShow = puede("gestionarReservas");

  function cambiarVista(valor) {
    const params = new URLSearchParams(searchParams);
    if (valor === "pendientes") params.delete("vista");
    else params.set("vista", valor);
    setSearchParams(params, { replace: true });
  }

  function abrirWalkin() {
    setWalkin(true);
    setWalkinVisitado(true);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        titulo="Check-in"
        subtitulo="Llegadas del día, llegadas atrasadas y walk-in."
        acciones={
          !walkin && (
            <Button icono={Plus} className="!h-11 !px-5" onClick={abrirWalkin}>
              Walk-in
            </Button>
          )
        }
      />

      {walkin && (
        <div>
          <Button variante="fantasma" icono={ArrowLeft} onClick={() => setWalkin(false)}>
            Volver a llegadas
          </Button>
        </div>
      )}
      {walkinVisitado && (
        <div hidden={!walkin}>
          <CheckInWalkIn habitacionPreseleccionada={habitacionPreseleccionada} />
        </div>
      )}

      <div hidden={walkin} className="flex min-w-0 flex-col gap-6">
        <IndicadoresLlegadas indicadores={indicadores} />

        {pendientesNoShow > 0 && (
          <div
            role="note"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--etiqueta-borde)] bg-[var(--aviso-bg)] px-4 py-3 text-[13.5px] text-[var(--aviso-texto)]"
          >
            <TriangleAlert size={18} strokeWidth={1.8} className="flex-none" aria-hidden="true" />
            <p className="m-0 min-w-0 flex-1">
              {plural(pendientesNoShow, "reserva", "reservas")} de días anteriores {pendientesNoShow === 1 ? "sigue" : "siguen"} sin ingreso y sin
              marcar como no presentadas. Las de ayer están en Atrasadas y todavía se pueden ingresar.
            </p>
            {puedeGestionarNoShow && (
              <Link to="/reservas/no-show" className="flex-none font-semibold underline-offset-2 hover:underline">
                Gestionar no-show →
              </Link>
            )}
          </div>
        )}

        <div className="min-w-0 overflow-hidden rounded-lg border border-borde bg-white">
          <Pestanas etiqueta="Llegadas" idBase="checkin" pestanas={pestanas} activa={vista} onCambiar={cambiarVista} />

          <FilterBar incrustada>
            <div className="relative min-w-[240px] flex-1">
              <Search size={15} strokeWidth={1.6} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
              <input
                type="search"
                aria-label="Buscar llegadas"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Código, huésped, documento o habitación"
                className={CLASE_BUSCADOR}
              />
            </div>
            <span className="ml-auto text-[13px] font-semibold text-piedra" aria-live="polite">
              {consulta.data ? plural(filas.length, "reserva", "reservas") : ""}
            </span>
          </FilterBar>

          <div role="tabpanel" id="checkin-panel" aria-labelledby={idPestana("checkin", vista)}>
            {consulta.isError ? (
              <div role="alert" className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                <p className="m-0 text-sm text-error-texto">No se pudieron cargar las llegadas.</p>
                <Button variante="secundario" onClick={() => consulta.refetch()}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <TablaLlegadas
                vista={vista}
                filas={filas}
                cargando={consulta.isLoading}
                hoy={hoy}
                busqueda={q}
                seleccionadaId={seleccionada?.id}
                onSeleccionar={(r) => {
                  setSeleccionada({ id: r.id, senia: r.senia });
                  setTimeout(() => panelReserva.current?.scrollIntoView?.({ block: "start" }), 0);
                }}
              />
            )}
          </div>
        </div>

        {codigo && porCodigo.isError && !seleccionada && (
          <p role="alert" className="text-[13px] text-error-texto">
            {porCodigo.error?.response?.data?.error ?? "No se encontró la reserva."}
          </p>
        )}
        {seleccionada && (
          <div ref={panelReserva}>
            <CheckInReserva key={seleccionada.id} reservaId={seleccionada.id} senia={seniaSeleccionada} onVolver={() => setSeleccionada(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
