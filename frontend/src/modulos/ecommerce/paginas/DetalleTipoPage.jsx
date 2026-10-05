import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, CircleAlert, Clock, FileText, Users } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { BuscadorEstadia } from "../componentes/BuscadorEstadia";
import { CargandoTarjetas } from "../componentes/Esqueleto";
import { ErrorConReintento } from "../componentes/ErrorConReintento";
import { GaleriaTipo } from "../componentes/GaleriaTipo";
import { Insignia } from "../componentes/Insignia";
import { Tarjeta } from "../componentes/Tarjeta";
import { FilaPlanResultado } from "../componentes/TarjetaTipoResultado";
import {
  VENTANA_VENTA_DIAS,
  busquedaComoQueryWeb,
  capacidadMaximaDeTipos,
  leerBusquedaDeUrl,
  textoNoShow,
  textoResumenBusqueda,
} from "../busquedaWeb";
import { consultarDisponibilidad, obtenerPlanes, obtenerTipos } from "../ecommerce.api";
import { HOTEL } from "../ecommerce.config";
import { contenidoDeTipo } from "../ecommerce.contenido";
import { formatearPrecio, formatearRangoFechas, nombreComercialPlan, textoCondicionesPlan, textoNoches } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";
import { useElegirPlan } from "../useElegirPlan";
import { useTituloPagina } from "../useTituloPagina";

const ID_PANEL = "ec-panel-reserva";

function irAlPanel() {
  const panel = document.getElementById(ID_PANEL);
  panel?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  panel?.focus?.({ preventScroll: true });
}

// Políticas de cancelación y no-show de cada plan, con los datos reales del
// plan (GET /api/web/planes).
function PoliticaCancelacion({ planes }) {
  if (!planes) return <p className="ec-texto-2">Depende de la tarifa que elijas: cada una muestra sus condiciones antes de reservar.</p>;
  return (
    <ul className="ec-detalle-tipo__lista">
      {planes.map((plan) => (
        <li key={plan.planTarifarioId}>
          <strong>{nombreComercialPlan(plan)}:</strong> {textoCondicionesPlan(plan)}. {textoNoShow(plan.penalidadNoShow)}
        </li>
      ))}
    </ul>
  );
}

// /web/habitacion/:tipoHabitacionId — Responsable: Gimena. Mockup págs. 3
// (escritorio) y 9 (móvil): galería, descripción, comodidades y políticas del
// TIPO (sin número ni piso) y un panel con los planes de ESTE tipo para la
// búsqueda (de la URL o del contexto).
export function DetalleTipoPage() {
  const { tipoHabitacionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const proceso = useProcesoCompra();
  const { definirBusqueda } = proceso;
  const [cambiandoFechas, setCambiandoFechas] = useState(false);

  const tipos = useQuery({ queryKey: ["ecommerce", "tipos"], queryFn: obtenerTipos, retry: false });
  const planes = useQuery({ queryKey: ["ecommerce", "planes"], queryFn: obtenerPlanes, retry: false });
  const tipo = tipos.data?.tipos.find((t) => String(t.tipoHabitacionId) === String(tipoHabitacionId));
  const capacidadMaxima = capacidadMaximaDeTipos(tipos.data?.tipos);
  const contenido = contenidoDeTipo(tipo?.nombre);
  useTituloPagina(tipos.data && !tipo ? "Habitación no encontrada" : `Habitación ${tipo?.nombre ?? ""}`.trim());

  // Búsqueda: la de la URL (link compartido) o, si no hay, la del contexto.
  const deUrl = leerBusquedaDeUrl(searchParams, { capacidadMaxima });
  const deContexto =
    proceso.fechaDesde && proceso.fechaHasta
      ? {
          fechaDesde: proceso.fechaDesde,
          fechaHasta: proceso.fechaHasta,
          adultos: proceso.ocupacion[0]?.adultos ?? 2,
          menores: proceso.ocupacion[0]?.menores ?? 0,
        }
      : null;
  const busqueda = deUrl.busqueda ? (deUrl.valida ? deUrl.busqueda : null) : deContexto;
  const claveBusqueda = busqueda ? busquedaComoQueryWeb(busqueda) : "";
  const parametros = useMemo(() => (busqueda ? { ...busqueda } : null), [claveBusqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!parametros || !deUrl.busqueda) return;
    definirBusqueda({
      fechaDesde: parametros.fechaDesde,
      fechaHasta: parametros.fechaHasta,
      ocupacion: [{ adultos: parametros.adultos, menores: parametros.menores }],
    });
  }, [parametros, definirBusqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  const disponibilidad = useQuery({
    queryKey: ["ecommerce", "disponibilidad", claveBusqueda],
    queryFn: () => consultarDisponibilidad(parametros),
    enabled: Boolean(parametros) && Boolean(tipo),
    retry: false,
  });
  const tipoDisponible = disponibilidad.data?.tipos.find((t) => String(t.tipoHabitacionId) === String(tipoHabitacionId));
  const disponible = Boolean(tipoDisponible) && tipoDisponible.planes.length > 0 && !tipoDisponible.motivoNoDisponible;
  const totalDesde = disponible ? Math.min(...tipoDisponible.planes.map((p) => Number(p.total))) : null;

  const { elegir, cotizando, errorPorTipo, errorGeneral, agotado } = useElegirPlan(parametros);

  function buscar(valores) {
    setCambiandoFechas(false);
    definirBusqueda({
      fechaDesde: valores.fechaDesde,
      fechaHasta: valores.fechaHasta,
      ocupacion: [{ adultos: valores.adultos, menores: valores.menores }],
    });
    navigate(`/web/habitacion/${tipoHabitacionId}?${busquedaComoQueryWeb(valores)}`, { replace: true });
  }

  const volverA = busqueda ? `/web/resultados?${busquedaComoQueryWeb(busqueda)}` : "/web";

  if (tipos.isPending) {
    return (
      <div className="ec-contenedor ec-detalle-tipo">
        <CargandoTarjetas cantidad={1} texto="Cargando la habitación…" className="ec-detalle-tipo__cargando" />
      </div>
    );
  }
  if (tipos.isError) {
    return (
      <div className="ec-contenedor ec-detalle-tipo">
        <ErrorConReintento error={tipos.error} onReintentar={() => tipos.refetch()} reintentando={tipos.isFetching} siempreReintentar />
      </div>
    );
  }
  if (!tipo) {
    return (
      <div className="ec-contenedor ec-detalle-tipo ec-pila">
        <h1 className="ec-titulo-pagina">No encontramos esa habitación</h1>
        <p className="ec-texto-2">Puede que el link esté incompleto o que esa habitación ya no se ofrezca en la web.</p>
        <div>
          <Boton variante="secundario" to="/web">
            <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> Ir al inicio
          </Boton>
        </div>
      </div>
    );
  }

  const buscador = (
    <BuscadorEstadia
      key={`${claveBusqueda}|${capacidadMaxima ?? ""}`}
      valoresIniciales={busqueda ?? deUrl.busqueda ?? undefined}
      onBuscar={buscar}
      etiquetaBoton="Ver precios"
      capacidadMaxima={capacidadMaxima}
      ventanaVentaDias={VENTANA_VENTA_DIAS}
      menoresConEdad
      fechasLegibles
      compacto
      erroresExternos={deUrl.busqueda && !deUrl.valida ? deUrl.errores : undefined}
    />
  );

  return (
    <div className="ec-contenedor ec-detalle-tipo">
      <nav className="ec-migas" aria-label="Migas de pan">
        <Link to="/web">Inicio</Link> <span aria-hidden="true">/</span>
        <Link to="/web#habitaciones">Habitaciones</Link> <span aria-hidden="true">/</span>
        <span aria-current="page">{tipo.nombre}</span>
      </nav>

      <div className="ec-detalle-tipo__encabezado">
        <div className="ec-pila ec-pila--chica">
          <div className="ec-detalle-tipo__titulo">
            <h1 className="ec-titulo-pagina">Habitación {tipo.nombre}</h1>
            {disponible && <Insignia color="verde">Disponible</Insignia>}
          </div>
          <p className="ec-fila ec-texto-2">
            <Users size={18} strokeWidth={1.7} aria-hidden="true" /> Hasta {tipo.capacidadMaxima} personas
          </p>
        </div>
        <Boton variante="texto" to={volverA}>
          <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> {busqueda ? "Volver a resultados" : "Volver al inicio"}
        </Boton>
      </div>

      <GaleriaTipo fotos={contenido.fotos} nombreTipo={tipo.nombre} />

      <div className="ec-detalle__grilla">
        <div className="ec-pila ec-detalle-tipo__contenido">
          <section aria-labelledby="ec-sobre">
            <h2 id="ec-sobre" className="ec-titulo-seccion">
              Sobre la habitación
            </h2>
            <p className="ec-texto-2">{contenido.descripcionAmpliada}</p>
          </section>

          <section aria-labelledby="ec-comodidades">
            <h2 id="ec-comodidades" className="ec-titulo-seccion">
              Comodidades
            </h2>
            <ul className="ec-chips ec-detalle-tipo__comodidades" aria-label="Comodidades">
              {contenido.comodidades.map(({ nombre, Icono }) => (
                <li key={nombre} className="ec-chip">
                  <Icono size={18} strokeWidth={1.6} aria-hidden="true" /> {nombre}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ec-politicas">
            <h2 id="ec-politicas" className="ec-titulo-seccion">
              Políticas de la estadía
            </h2>
            <div className="ec-pila ec-pila--chica">
              <div className="ec-politica">
                <Clock size={20} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <p className="ec-resumen__valor">Check-in y check-out</p>
                  <p className="ec-texto-2">
                    Entrada desde las {HOTEL.checkIn} · salida hasta las {HOTEL.checkOut}
                  </p>
                </div>
              </div>
              <div className="ec-politica">
                <CalendarDays size={20} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <p className="ec-resumen__valor">Cancelación</p>
                  <PoliticaCancelacion planes={planes.data?.planes} />
                </div>
              </div>
              <div className="ec-politica">
                <FileText size={20} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <p className="ec-resumen__valor">Documentación</p>
                  <p className="ec-texto-2">DNI o pasaporte de cada huésped al momento del check-in.</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="ec-detalle-tipo__lateral" aria-labelledby="ec-titulo-panel">
          <Tarjeta relleno className="ec-pila ec-detalle-tipo__panel" id={ID_PANEL} tabIndex={-1}>
            {!busqueda ? (
              <>
                <h2 id="ec-titulo-panel" className="ec-titulo-seccion">
                  Elegí tus fechas para ver precios
                </h2>
                <p className="ec-texto-2">Te mostramos las tarifas de esta habitación y el total de tu estadía, IVA incluido.</p>
                {buscador}
              </>
            ) : (
              <>
                <h2 id="ec-titulo-panel" className="ec-titulo-seccion">
                  Tu estadía
                </h2>
                <div className="ec-detalle-tipo__estadia">
                  <p>
                    <strong>{formatearRangoFechas(busqueda.fechaDesde, busqueda.fechaHasta)}</strong>
                  </p>
                  <p className="ec-texto-2">
                    {textoResumenBusqueda(busqueda)} · check-in desde las {HOTEL.checkIn} · check-out hasta las {HOTEL.checkOut}
                  </p>
                  <Boton variante="texto" onClick={() => setCambiandoFechas((v) => !v)} aria-expanded={cambiandoFechas}>
                    {cambiandoFechas ? "Cancelar" : "Cambiar fechas o huéspedes"}
                  </Boton>
                </div>
                {cambiandoFechas && buscador}

                {agotado && (
                  <p className="ec-alerta ec-alerta--aviso" role="alert">
                    <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" /> Ese tipo se agotó para tus fechas.
                  </p>
                )}
                <ErrorConReintento error={errorGeneral} />
                {errorPorTipo[tipo.tipoHabitacionId] && (
                  <p className="ec-alerta ec-alerta--aviso" role="alert">
                    <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" /> {errorPorTipo[tipo.tipoHabitacionId]}
                  </p>
                )}

                {disponibilidad.isPending && (
                  <p className="ec-cargando" role="status">
                    Buscando precios…
                  </p>
                )}
                {disponibilidad.isError && (
                  <ErrorConReintento
                    error={disponibilidad.error}
                    onReintentar={() => disponibilidad.refetch()}
                    reintentando={disponibilidad.isFetching}
                  />
                )}
                {disponibilidad.data && !disponible && (
                  <p className="ec-resultado__no-disponible">
                    <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" />{" "}
                    {tipoDisponible?.motivoNoDisponible ?? "Sin disponibilidad para estas fechas"}
                  </p>
                )}
                {disponible && (
                  <div className="ec-detalle-tipo__planes">
                    {tipoDisponible.planes.map((plan) => (
                      <FilaPlanResultado
                        key={plan.planTarifarioId}
                        plan={plan}
                        planes={tipoDisponible.planes}
                        noches={disponibilidad.data.noches}
                        onElegir={(p) => elegir(tipoDisponible, p)}
                        cotizando={cotizando === `${tipoDisponible.tipoHabitacionId}:${plan.planTarifarioId}`}
                        deshabilitado={Boolean(cotizando)}
                        etiquetaBoton="Reservar"
                      />
                    ))}
                    <p className="ec-texto-2 ec-chico">Precio final en pesos argentinos, IVA incluido. No se cobra nada hasta el pago.</p>
                  </div>
                )}
              </>
            )}
          </Tarjeta>
        </aside>
      </div>

      <div className="ec-barra-movil ec-detalle-tipo__barra">
        {totalDesde !== null ? (
          <div>
            <p className="ec-barra-movil__monto">{formatearPrecio(totalDesde)}</p>
            <p className="ec-barra-movil__leyenda">
              Desde · total {textoNoches(disponibilidad.data.noches)} · IVA incluido
            </p>
          </div>
        ) : (
          <p className="ec-barra-movil__leyenda">{busqueda ? "Mirá la disponibilidad de tus fechas" : "Elegí tus fechas para ver precios"}</p>
        )}
        <Boton onClick={irAlPanel}>{totalDesde !== null ? "Reservar" : "Ver precios"}</Boton>
      </div>
    </div>
  );
}
