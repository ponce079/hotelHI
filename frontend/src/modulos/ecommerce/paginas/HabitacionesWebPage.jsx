import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BuscadorEstadia } from "../componentes/BuscadorEstadia";
import { CargandoTarjetas } from "../componentes/Esqueleto";
import { ErrorConReintento } from "../componentes/ErrorConReintento";
import { FranjaConfianza, NotaPrecioReferencia, Portada, TablaComparativa, TarjetaHabitacionWeb } from "../componentes/PiezasWeb";
import { VENTANA_VENTA_DIAS, busquedaComoQueryWeb, capacidadMaximaDeTipos } from "../busquedaWeb";
import { obtenerTipos } from "../ecommerce.api";
import { useProcesoCompra } from "../ProcesoCompraContext";
import { usePrecioReferencia } from "../usePrecioReferencia";
import { useRevelar } from "../useRevelar";
import { useTituloPagina } from "../useTituloPagina";

// /web/habitaciones — todas las categorías del hotel (de /api/web/tipos), con filtro por
// cantidad de huéspedes. El precio de las tarjetas es orientativo (usePrecioReferencia): el
// real depende de las fechas, por eso arriba va el buscador que lleva a /web/resultados.
const FILTROS = [
  { clave: "todas", texto: "Todas las habitaciones", cumple: () => true },
  { clave: "1-2", texto: "1 a 2 personas", cumple: (tipo) => tipo.capacidadMaxima <= 2 },
  { clave: "3+", texto: "3 o más personas", cumple: (tipo) => tipo.capacidadMaxima >= 3 },
];

export function HabitacionesWebPage() {
  useTituloPagina("Habitaciones");
  const navigate = useNavigate();
  const raiz = useRevelar();
  const [filtro, setFiltro] = useState("todas");
  const { fechaDesde, fechaHasta, ocupacion, definirBusqueda } = useProcesoCompra();
  const tipos = useQuery({ queryKey: ["ecommerce", "tipos"], queryFn: obtenerTipos, retry: false });
  const referencia = usePrecioReferencia();
  const capacidadMaxima = capacidadMaximaDeTipos(tipos.data?.tipos);
  const elegido = FILTROS.find((f) => f.clave === filtro);
  const visibles = (tipos.data?.tipos ?? []).filter(elegido.cumple);

  function buscar(valores) {
    definirBusqueda({
      fechaDesde: valores.fechaDesde,
      fechaHasta: valores.fechaHasta,
      ocupacion: [{ adultos: valores.adultos, menores: valores.menores }],
    });
    navigate(`/web/resultados?${busquedaComoQueryWeb(valores)}`);
  }

  return (
    <div ref={raiz}>
      <Portada chica foto="hab" idTitulo="ec-titulo-habitaciones-pagina" titulo="Habitaciones" bajada="Descansá en un entorno único, con todo el confort que necesitás." />

      <div id="buscar" className="ec-contenedor ec-hero__buscador">
        <BuscadorEstadia
          key={capacidadMaxima ?? "sin-tipos"}
          valoresIniciales={{ fechaDesde, fechaHasta, adultos: ocupacion[0]?.adultos, menores: ocupacion[0]?.menores }}
          onBuscar={buscar}
          capacidadMaxima={capacidadMaxima}
          ventanaVentaDias={VENTANA_VENTA_DIAS}
          menoresConEdad
          fechasLegibles
        />
      </div>

      <div className="ec-contenedor">
        <FranjaConfianza />
      </div>

      <section className="ec-contenedor ec-seccion" aria-label="Categorías de habitaciones">
        <div className="ec-filtros" role="group" aria-label="Filtrar por cantidad de huéspedes">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              type="button"
              className={`ec-filtro ${filtro === f.clave ? "ec-filtro--activo" : ""}`.trim()}
              aria-pressed={filtro === f.clave}
              onClick={() => setFiltro(f.clave)}
            >
              {f.texto}
            </button>
          ))}
        </div>
        <p className="ec-texto-2 ec-chico ec-filtros__nota">Elegí tus fechas arriba para ver el precio exacto y la disponibilidad.</p>

        {tipos.isPending && <CargandoTarjetas className="ec-grilla-habitaciones" texto="Cargando habitaciones…" />}
        {tipos.isError && (
          <ErrorConReintento
            error={tipos.error}
            titulo="No pudimos cargar las habitaciones."
            onReintentar={() => tipos.refetch()}
            reintentando={tipos.isFetching}
            siempreReintentar
          />
        )}
        {tipos.data && visibles.length === 0 && <p className="ec-texto-2">No hay habitaciones con ese filtro.</p>}
        {tipos.data && visibles.length > 0 && (
          <div className="ec-grilla-habitaciones">
            {visibles.map((tipo, i) => (
              <TarjetaHabitacionWeb key={tipo.tipoHabitacionId} tipo={tipo} demora={i * 90} desdePorNoche={referencia.precioDe(tipo.tipoHabitacionId)} />
            ))}
          </div>
        )}
        {tipos.data && visibles.length > 0 && referencia.hayPrecios && <NotaPrecioReferencia fecha={referencia.fecha} />}
      </section>

      {tipos.data?.tipos.length > 1 && (
        <section className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-comparar">
          <p className="ec-sobretitulo ec-revelar">¿Cuál elegir?</p>
          <h2 id="ec-titulo-comparar" className="ec-titulo-seccion ec-revelar">
            Compará las habitaciones
          </h2>
          <TablaComparativa tipos={tipos.data.tipos} />
        </section>
      )}
    </div>
  );
}
