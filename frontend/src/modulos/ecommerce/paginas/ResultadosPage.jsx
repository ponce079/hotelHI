import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Users } from "lucide-react";
import { BuscadorEstadia, validarBusqueda } from "../componentes/BuscadorEstadia";
import { FotoEjemplo } from "../componentes/FotoEjemplo";
import { Insignia } from "../componentes/Insignia";
import { MensajeError } from "../componentes/MensajeError";
import { Tarjeta } from "../componentes/Tarjeta";
import { TarjetaPlan } from "../componentes/TarjetaPlan";
import { consultarDisponibilidad } from "../ecommerce.api";
import { contenidoDeTipo } from "../ecommerce.contenido";
import { LEYENDA_PRECIO_FINAL, busquedaComoQuery, formatearRangoFechas, textoNoches, textoOcupacion } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";

// /web/resultados — Responsable: Gimena. Mockup pág. 2, con las decisiones
// de diseño: una tarjeta por TIPO con sus planes (sin números de
// habitación, piso, filtros ni "N libres"); los tipos no disponibles se
// muestran deshabilitados con su motivo.
function leerBusqueda(searchParams, contexto) {
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  if (desde && hasta) {
    return {
      fechaDesde: desde,
      fechaHasta: hasta,
      adultos: Number(searchParams.get("adultos") ?? 2),
      menores: Number(searchParams.get("menores") ?? 0),
    };
  }
  if (contexto.fechaDesde && contexto.fechaHasta) {
    return {
      fechaDesde: contexto.fechaDesde,
      fechaHasta: contexto.fechaHasta,
      adultos: contexto.ocupacion[0]?.adultos ?? 2,
      menores: contexto.ocupacion[0]?.menores ?? 0,
    };
  }
  return null;
}

export function ResultadosPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const proceso = useProcesoCompra();
  const { definirBusqueda, elegirPlan, tipo: tipoElegido, plan: planElegido } = proceso;

  const busqueda = leerBusqueda(searchParams, proceso);
  const valida = busqueda && Object.keys(validarBusqueda(busqueda)).length === 0;
  const claveBusqueda = busqueda ? busquedaComoQuery(busqueda) : "";
  const parametros = useMemo(() => (busqueda ? { ...busqueda } : null), [claveBusqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  // La URL manda: si llegaron con un link, el contexto se alinea con ella.
  useEffect(() => {
    if (!parametros || !valida) return;
    definirBusqueda({
      fechaDesde: parametros.fechaDesde,
      fechaHasta: parametros.fechaHasta,
      ocupacion: [{ adultos: parametros.adultos, menores: parametros.menores }],
    });
  }, [parametros, valida, definirBusqueda]);

  const disponibilidad = useQuery({
    queryKey: ["ecommerce", "disponibilidad", claveBusqueda],
    queryFn: () => consultarDisponibilidad(parametros),
    enabled: Boolean(valida),
    retry: false,
  });

  function buscar(valores) {
    navigate(`/web/resultados?${busquedaComoQuery(valores)}`);
  }

  function elegir(tipo, plan) {
    elegirPlan(tipo, plan);
    navigate("/web/datos");
  }

  return (
    <div className="ec-contenedor">
      <section className="ec-banda" aria-labelledby="ec-titulo-resultados">
        <h1 id="ec-titulo-resultados">Habitaciones disponibles</h1>
        <p className="ec-banda__bajada">Elegí la que mejor se adapte a tu viaje. Los precios son el total de tu estadía, IVA incluido.</p>
        <BuscadorEstadia key={claveBusqueda} valoresIniciales={busqueda ?? undefined} onBuscar={buscar} etiquetaBoton="Actualizar" />
      </section>

      {!valida && (
        <p className="ec-resultados__resumen ec-texto-2">Elegí tus fechas y la cantidad de huéspedes para ver las habitaciones y sus precios.</p>
      )}

      {valida && (
        <p className="ec-resultados__resumen">
          <strong>{formatearRangoFechas(busqueda.fechaDesde, busqueda.fechaHasta)}</strong>
          <span className="ec-texto-2">
            {" "}
            · {disponibilidad.data ? textoNoches(disponibilidad.data.noches) : ""} · {textoOcupacion(busqueda)}
          </span>
        </p>
      )}

      {valida && disponibilidad.isPending && <p className="ec-cargando">Buscando disponibilidad…</p>}
      {disponibilidad.isError && <MensajeError error={disponibilidad.error} />}

      {disponibilidad.data && (
        <div className="ec-resultados__lista">
          {disponibilidad.data.tipos.map((tipo) => {
            const contenido = contenidoDeTipo(tipo.nombre);
            const disponible = tipo.planes.length > 0;
            return (
              <Tarjeta
                como="article"
                key={tipo.tipoHabitacionId}
                className="ec-resultado"
                deshabilitada={!disponible}
                aria-disabled={!disponible || undefined}
                aria-labelledby={`ec-tipo-${tipo.tipoHabitacionId}`}
              >
                <FotoEjemplo texto={contenido.fotos[0]} />
                <div className="ec-resultado__cuerpo">
                  <div className="ec-resultado__titulo">
                    <h2 id={`ec-tipo-${tipo.tipoHabitacionId}`}>{tipo.nombre}</h2>
                    {disponible && tipo.ultimasDisponibles && <Insignia color="dorado">Últimas disponibles</Insignia>}
                  </div>
                  <p className="ec-fila ec-texto-2">
                    <Users size={18} strokeWidth={1.7} aria-hidden="true" /> Hasta {tipo.capacidadMaxima} personas
                  </p>
                  <p className="ec-texto-2">{contenido.descripcion}</p>
                  <ul className="ec-chips" aria-label="Comodidades">
                    {contenido.comodidades.map(({ nombre, Icono }) => (
                      <li key={nombre} className="ec-chip">
                        <Icono size={18} strokeWidth={1.6} aria-hidden="true" /> {nombre}
                      </li>
                    ))}
                  </ul>
                  {disponible ? (
                    <div className="ec-resultado__planes">
                      {tipo.planes.map((plan) => (
                        <TarjetaPlan
                          key={plan.planTarifarioId}
                          plan={plan}
                          noches={disponibilidad.data.noches}
                          elegido={tipoElegido?.tipoHabitacionId === tipo.tipoHabitacionId && planElegido?.planTarifarioId === plan.planTarifarioId}
                          onElegir={() => elegir(tipo, plan)}
                        />
                      ))}
                      <p className="ec-texto-2 ec-chico">{LEYENDA_PRECIO_FINAL}</p>
                    </div>
                  ) : (
                    <p className="ec-resultado__no-disponible">
                      <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" /> {tipo.motivoNoDisponible}
                    </p>
                  )}
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
