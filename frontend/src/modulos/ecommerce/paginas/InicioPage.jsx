import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bus, Church, ChevronRight, MapPin, Plane } from "lucide-react";
import { BuscadorEstadia } from "../componentes/BuscadorEstadia";
import { Boton } from "../componentes/Boton";
import { FotoWeb, FranjaConfianza, ListaExperiencias, NotaPrecioReferencia, Portada, TarjetaHabitacionWeb, TarjetaPromo } from "../componentes/PiezasWeb";
import { CargandoTarjetas } from "../componentes/Esqueleto";
import { ErrorConReintento } from "../componentes/ErrorConReintento";
import { VENTANA_VENTA_DIAS, busquedaComoQueryWeb, capacidadMaximaDeTipos } from "../busquedaWeb";
import { obtenerTipos } from "../ecommerce.api";
import { HOTEL } from "../ecommerce.config";
import { ACCESOS_INICIO, DISTANCIAS_HOTEL, FOTOS_SERVICIOS, PROMOCIONES_WEB, SERVICIOS_HOTEL } from "../ecommerce.contenido";
import { useProcesoCompra } from "../ProcesoCompraContext";
import { usePrecioReferencia } from "../usePrecioReferencia";
import { useRevelar } from "../useRevelar";
import { useTituloPagina } from "../useTituloPagina";

// /web — Rediseño "Holiday Inn Salta" (modelo HTML del equipo): portada con foto,
// buscador flotante, accesos, habitaciones (de /api/web/tipos), servicios,
// promociones, experiencias y ubicación. Las habitaciones muestran un precio orientativo
// (usePrecioReferencia); el exacto aparece al buscar.

const ICONOS_DISTANCIA = [Plane, Church, Bus];

export function InicioPage() {
  useTituloPagina("Reservá directo");
  const navigate = useNavigate();
  const raiz = useRevelar();
  const { fechaDesde, fechaHasta, ocupacion, definirBusqueda } = useProcesoCompra();
  const tipos = useQuery({ queryKey: ["ecommerce", "tipos"], queryFn: obtenerTipos, retry: false });
  const capacidadMaxima = capacidadMaximaDeTipos(tipos.data?.tipos);
  const referencia = usePrecioReferencia();

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
      <Portada
        foto="hero"
        sobretitulo={`${HOTEL.nombre} ${HOTEL.bajada}`}
        titulo={
          <>
            Viví Salta.
            <br />
            Descansá diferente.
          </>
        }
        bajada="Una estadía premium en el corazón del Norte Argentino."
      />

      <div id="buscar" className="ec-contenedor ec-hero__buscador">
        <BuscadorEstadia
          // key: el buscador se arma de nuevo cuando llega la capacidad real de /api/web/tipos.
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

      <section className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-experiencia">
        <h2 id="ec-titulo-experiencia" className="ec-titulo-seccion ec-revelar">
          Elegí tu experiencia
        </h2>
        <div className="ec-grilla-accesos">
          {ACCESOS_INICIO.map((acceso, i) => (
            <Link key={acceso.titulo} to={acceso.destino} className="ec-acceso ec-revelar" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="ec-acceso__foto">
                <FotoWeb nombre={acceso.foto} />
              </span>
              <span className="ec-acceso__cuerpo">
                <span>
                  <span className="ec-acceso__titulo">{acceso.titulo}</span>
                  <span className="ec-acceso__texto">{acceso.texto}</span>
                </span>
                <span className="ec-flecha" aria-hidden="true">
                  <ChevronRight size={14} strokeWidth={2} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="habitaciones" className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-habitaciones">
        <p className="ec-sobretitulo ec-revelar">Habitaciones</p>
        <div className="ec-seccion__fila ec-revelar">
          <h2 id="ec-titulo-habitaciones" className="ec-titulo-seccion">
            Descansá en un entorno único
          </h2>
          <Link to="/web/habitaciones" className="ec-ver-todas">
            Ver todas
          </Link>
        </div>
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
        {tipos.data && (
          <div className="ec-grilla-habitaciones">
            {tipos.data.tipos.map((tipo, i) => (
              <TarjetaHabitacionWeb key={tipo.tipoHabitacionId} tipo={tipo} demora={i * 90} desdePorNoche={referencia.precioDe(tipo.tipoHabitacionId)} />
            ))}
          </div>
        )}
        {tipos.data && referencia.hayPrecios && <NotaPrecioReferencia fecha={referencia.fecha} />}
      </section>

      <section id="servicios" className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-servicios">
        <p className="ec-sobretitulo ec-revelar">Nuestros servicios</p>
        <h2 id="ec-titulo-servicios" className="ec-titulo-seccion ec-revelar">
          Todo lo que necesitás, a tu alcance
        </h2>
        <ul className="ec-grilla-servicios">
          {SERVICIOS_HOTEL.map(({ nombre, texto, Icono }, i) => (
            <li key={nombre} className="ec-servicio ec-revelar" style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="ec-servicio__icono">
                <Icono size={26} strokeWidth={1.4} aria-hidden="true" />
              </span>
              <span className="ec-servicio__nombre">{nombre}</span>
              <span className="ec-servicio__texto">{texto}</span>
            </li>
          ))}
        </ul>
        <ul className="ec-galeria-servicios" aria-label="Fotos del hotel">
          {FOTOS_SERVICIOS.map(({ nombre, foto }, i) => (
            <li key={foto} className="ec-galeria-servicios__foto ec-revelar" style={{ transitionDelay: `${i * 80}ms` }}>
              <FotoWeb nombre={foto} alt={nombre} />
              <span className="ec-galeria-servicios__nombre">{nombre}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="promociones" className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-promociones">
        <p className="ec-sobretitulo ec-revelar">Promociones</p>
        <div className="ec-seccion__fila ec-revelar">
          <h2 id="ec-titulo-promociones" className="ec-titulo-seccion">
            Beneficios para tu estadía
          </h2>
          <Link to="/web/promociones" className="ec-ver-todas">
            Ver todas
          </Link>
        </div>
        <div className="ec-grilla-promos">
          {PROMOCIONES_WEB.map((promo, i) => (
            <TarjetaPromo key={promo.titulo} promo={promo} demora={i * 100} />
          ))}
        </div>
      </section>

      <section id="destino" className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-experiencias">
        <div className="ec-destino ec-revelar">
          <FotoWeb nombre="cac" />
          <div className="ec-destino__texto">
            <p className="ec-destino__sobretitulo">Destino Salta</p>
            <h2 id="ec-titulo-experiencias">
              Montañas, cultura
              <br />y tradición viva
            </h2>
            <p>Excursiones, bodegas, gastronomía regional y paisajes que se quedan con vos.</p>
            <Boton to="/web/experiencias" className="ec-destino__boton">
              Descubrir experiencias
            </Boton>
          </div>
        </div>
        <ListaExperiencias />
      </section>

      <section id="ubicacion" className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-ubicacion">
        <p className="ec-sobretitulo ec-revelar">Ubicación</p>
        <h2 id="ec-titulo-ubicacion" className="ec-titulo-seccion ec-revelar">
          En el corazón de Salta
        </h2>
        <div className="ec-ubicacion-nueva ec-revelar">
          <div className="ec-mapa" role="img" aria-label="Mapa ilustrativo de la ubicación del hotel">
            <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <rect width="400" height="260" fill="#efe5cc" />
              <g stroke="#fbf7ec" strokeWidth="9" fill="none">
                <path d="M0 70h400M0 160h400M90 0v260M230 0v260M330 0v260" />
              </g>
              <path d="M0 220c80-30 160 10 400-40" stroke="#c9d8c4" strokeWidth="14" fill="none" />
              <rect x="250" y="95" width="60" height="50" fill="#d8e3cf" />
              <g className="ec-mapa__pin">
                <path d="M160 130c-14-22-22-30-22-42a22 22 0 0 1 44 0c0 12-8 20-22 42z" fill="#b5603a" />
                <circle cx="160" cy="88" r="8" fill="#fbf7ec" />
              </g>
            </svg>
          </div>
          <div className="ec-ubicacion-nueva__datos">
            <h3>
              {HOTEL.nombre} {HOTEL.bajada}
            </h3>
            <p className="ec-texto-2">
              <MapPin size={16} strokeWidth={1.6} aria-hidden="true" /> {HOTEL.direccion}
            </p>
            <ul className="ec-distancias">
              {DISTANCIAS_HOTEL.map((texto, i) => {
                const Icono = ICONOS_DISTANCIA[i];
                return (
                  <li key={texto}>
                    <Icono size={16} strokeWidth={1.6} aria-hidden="true" /> {texto}
                  </li>
                );
              })}
            </ul>
            <dl className="ec-horarios">
              <div>
                <dt>Check-in</dt>
                <dd>Desde las {HOTEL.checkIn}</dd>
              </div>
              <div>
                <dt>Check-out</dt>
                <dd>Hasta las {HOTEL.checkOut}</dd>
              </div>
              <div>
                <dt>Recepción</dt>
                <dd>{HOTEL.telefono}</dd>
              </div>
            </dl>
            <a
              className="ec-boton ec-boton--primario ec-boton--bloque"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(HOTEL.direccion)}`}
              target="_blank"
              rel="noreferrer"
            >
              Cómo llegar
            </a>
            <p className="ec-chico">
              <Link to="/web/mi-reserva">¿Ya reservaste? Consultá tu reserva</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
