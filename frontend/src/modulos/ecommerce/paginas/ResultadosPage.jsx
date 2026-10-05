import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Phone } from "lucide-react";
import { BuscadorEstadia } from "../componentes/BuscadorEstadia";
import { CargandoTarjetas } from "../componentes/Esqueleto";
import { ErrorConReintento } from "../componentes/ErrorConReintento";
import { TarjetaTipoResultado } from "../componentes/TarjetaTipoResultado";
import {
  VENTANA_VENTA_DIAS,
  busquedaComoQueryWeb,
  capacidadMaximaDeTipos,
  hayDisponibles,
  leerBusquedaDeUrl,
  motivoMasRelevante,
  ordenarTipos,
  textoResumenBusqueda,
} from "../busquedaWeb";
import { consultarDisponibilidad, obtenerTipos } from "../ecommerce.api";
import { HOTEL } from "../ecommerce.config";
import { CODIGO_ERROR } from "../ecommerce.constantes";
import { formatearRangoFechas } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";
import { useElegirPlan } from "../useElegirPlan";
import { useTituloPagina } from "../useTituloPagina";

// /web/resultados — Responsable: Gimena. Mockup pág. 2 (escritorio) y 8
// (móvil), vendiendo por TIPO (decisión del contrato: sin números de
// habitación, sin filtros por habitación).
//
// La búsqueda vive en la URL (?entrada&salida&adultos&menores): un F5 o un
// link compartido la repiten. Si la URL no trae búsqueda pero el contexto sí,
// se completa la URL con la del contexto. Parámetros inválidos → aviso y
// buscador, sin consultar la API.
export function ResultadosPage() {
  useTituloPagina("Habitaciones disponibles");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const proceso = useProcesoCompra();
  const { definirBusqueda } = proceso;

  const tipos = useQuery({ queryKey: ["ecommerce", "tipos"], queryFn: obtenerTipos, retry: false });
  const capacidadMaxima = capacidadMaximaDeTipos(tipos.data?.tipos);

  const deUrl = leerBusquedaDeUrl(searchParams, { capacidadMaxima });
  const desdeContexto =
    !deUrl.busqueda && proceso.fechaDesde && proceso.fechaHasta
      ? {
          fechaDesde: proceso.fechaDesde,
          fechaHasta: proceso.fechaHasta,
          adultos: proceso.ocupacion[0]?.adultos ?? 2,
          menores: proceso.ocupacion[0]?.menores ?? 0,
        }
      : null;
  const busqueda = deUrl.busqueda;
  const valida = Boolean(busqueda) && deUrl.valida;
  const claveBusqueda = valida ? busquedaComoQueryWeb(busqueda) : "";
  const parametros = useMemo(() => (valida ? { ...busqueda } : null), [claveBusqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sin búsqueda en la URL: se completa con la del contexto (reemplazando la entrada del historial).
  useEffect(() => {
    if (desdeContexto) navigate(`/web/resultados?${busquedaComoQueryWeb(desdeContexto)}`, { replace: true });
  }, [desdeContexto?.fechaDesde, desdeContexto?.fechaHasta, desdeContexto?.adultos, desdeContexto?.menores]); // eslint-disable-line react-hooks/exhaustive-deps

  // La URL manda: si llegaron con un link, el contexto se alinea con ella.
  useEffect(() => {
    if (!parametros) return;
    definirBusqueda({
      fechaDesde: parametros.fechaDesde,
      fechaHasta: parametros.fechaHasta,
      ocupacion: [{ adultos: parametros.adultos, menores: parametros.menores }],
    });
  }, [parametros, definirBusqueda]);

  const disponibilidad = useQuery({
    queryKey: ["ecommerce", "disponibilidad", claveBusqueda],
    queryFn: () => consultarDisponibilidad(parametros),
    enabled: valida,
    retry: false,
  });

  const { elegir, cotizando, errorPorTipo, errorGeneral, agotado } = useElegirPlan(parametros);

  function buscar(valores) {
    navigate(`/web/resultados?${busquedaComoQueryWeb(valores)}`);
  }

  // Un DATOS_INVALIDOS de la API marca el campo del buscador.
  const errorApi = disponibilidad.error;
  const erroresExternos =
    errorApi?.codigo === CODIGO_ERROR.DATOS_INVALIDOS && errorApi.campo ? { [errorApi.campo]: errorApi.mensaje } : undefined;
  const avisoUrl = Boolean(busqueda) && !deUrl.valida && Object.keys(deUrl.errores).length > 0;

  const tiposOrdenados = disponibilidad.data ? ordenarTipos(disponibilidad.data.tipos) : [];
  const ningunoDisponible = Boolean(disponibilidad.data) && !hayDisponibles(disponibilidad.data.tipos);

  return (
    <div className="ec-contenedor">
      <section className="ec-banda" aria-labelledby="ec-titulo-resultados">
        <h1 id="ec-titulo-resultados">Habitaciones disponibles</h1>
        <p className="ec-banda__bajada">Elegí la que mejor se adapte a tu viaje. Los precios son el total de tu estadía, IVA incluido.</p>
        <BuscadorEstadia
          key={`${claveBusqueda}|${capacidadMaxima ?? ""}|${avisoUrl ? "aviso" : ""}`}
          valoresIniciales={busqueda ?? desdeContexto ?? undefined}
          onBuscar={buscar}
          etiquetaBoton="Actualizar"
          capacidadMaxima={capacidadMaxima}
          ventanaVentaDias={VENTANA_VENTA_DIAS}
          menoresConEdad
          fechasLegibles
          erroresExternos={avisoUrl ? deUrl.errores : erroresExternos}
        />
      </section>

      {avisoUrl && (
        <p className="ec-alerta ec-alerta--aviso ec-resultados__aviso" role="alert">
          <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" />
          La búsqueda del link no es válida. Revisá las fechas y los huéspedes marcados y buscá de nuevo.
        </p>
      )}

      {!busqueda && !desdeContexto && (
        <p className="ec-resultados__resumen ec-texto-2">Elegí tus fechas y la cantidad de huéspedes para ver las habitaciones y sus precios.</p>
      )}

      {valida && (
        <p className="ec-resultados__resumen">
          <strong>{formatearRangoFechas(busqueda.fechaDesde, busqueda.fechaHasta)}</strong>
          <span className="ec-texto-2"> · {textoResumenBusqueda(busqueda)}</span>
        </p>
      )}

      {agotado && (
        <p className="ec-alerta ec-alerta--aviso ec-resultados__aviso" role="alert">
          <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" />
          Ese tipo se agotó para tus fechas. Actualizamos los resultados.
        </p>
      )}
      <ErrorConReintento error={errorGeneral} />

      {valida && disponibilidad.isPending && <CargandoTarjetas conPlanes texto="Buscando disponibilidad…" className="ec-resultados__lista" />}
      {disponibilidad.isError && !erroresExternos && (
        <ErrorConReintento
          error={disponibilidad.error}
          onReintentar={() => disponibilidad.refetch()}
          reintentando={disponibilidad.isFetching}
        />
      )}
      {disponibilidad.isError && erroresExternos && (
        <p className="ec-alerta ec-alerta--error" role="alert">
          <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" /> {errorApi.mensaje}
        </p>
      )}

      {ningunoDisponible && (
        <div className="ec-vacio" role="status">
          <h2 className="ec-titulo-seccion">{motivoMasRelevante(disponibilidad.data.tipos) ?? "Sin disponibilidad para estas fechas"}</h2>
          <p className="ec-texto-2">Probá con otras fechas o con menos huéspedes.</p>
          <p className="ec-fila ec-texto-2">
            <Phone size={18} strokeWidth={1.7} aria-hidden="true" /> ¿Necesitás ayuda? Recepción: {HOTEL.telefono}
          </p>
        </div>
      )}

      {disponibilidad.data && (
        <div className="ec-resultados__lista">
          {tiposOrdenados.map((tipo) => (
            <TarjetaTipoResultado
              key={tipo.tipoHabitacionId}
              tipo={tipo}
              noches={disponibilidad.data.noches}
              onElegir={elegir}
              cotizando={cotizando}
              bloqueado={Boolean(cotizando)}
              error={errorPorTipo[tipo.tipoHabitacionId] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
