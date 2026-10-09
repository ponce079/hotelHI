import { Boton } from "../componentes/Boton";
import { FotoWeb, Itinerario, ListaExperiencias, Portada, TarjetaExcursion } from "../componentes/PiezasWeb";
import { EXCURSIONES_SALTA } from "../ecommerce.contenido";
import { useRevelar } from "../useRevelar";
import { useTituloPagina } from "../useTituloPagina";

// /web/experiencias — qué hacer en Salta durante la estadía: excursiones con foto, un
// itinerario sugerido y el resumen del modelo. El hotel no vende las excursiones: se
// consultan en recepción.
export function ExperienciasPage() {
  useTituloPagina("Experiencias en Salta");
  const raiz = useRevelar();
  return (
    <div ref={raiz}>
      <Portada chica foto="e3" idTitulo="ec-titulo-experiencias-pagina" titulo="Experiencias en Salta" bajada="Paisajes, cultura y tradición." />

      <section className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-excursiones">
        <p className="ec-sobretitulo ec-revelar">Excursiones y paseos</p>
        <h2 id="ec-titulo-excursiones" className="ec-titulo-seccion ec-revelar">
          Lo imperdible de Salta
        </h2>
        <div className="ec-grilla-excursiones">
          {EXCURSIONES_SALTA.map((excursion, i) => (
            <TarjetaExcursion key={excursion.nombre} excursion={excursion} demora={(i % 3) * 100} />
          ))}
        </div>
        <p className="ec-texto-2 ec-chico ec-filtros__nota">
          Consultá en recepción por horarios, precios y reservas con operadores locales. Duraciones aproximadas.
        </p>
      </section>

      <section className="ec-itinerario-seccion" aria-labelledby="ec-titulo-itinerario">
        <div className="ec-contenedor ec-seccion">
          <p className="ec-sobretitulo ec-revelar">Itinerario sugerido</p>
          <h2 id="ec-titulo-itinerario" className="ec-titulo-seccion ec-revelar">
            Tu fin de semana en Salta
          </h2>
          <Itinerario />
          <Boton to="/web/habitaciones#buscar" className="ec-revelar">
            Reservá tu fin de semana
          </Boton>
        </div>
      </section>

      <section className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-salta-medida">
        <div className="ec-experiencias-pagina">
          <div className="ec-experiencias-pagina__foto ec-revelar">
            <FotoWeb nombre="cac" alt="Cardones en los Valles Calchaquíes" />
          </div>
          <div>
            <p className="ec-sobretitulo ec-revelar">Salta a tu medida</p>
            <h2 id="ec-titulo-salta-medida" className="ec-titulo-seccion ec-revelar">
              Montañas, cultura y tradición viva
            </h2>
            <ListaExperiencias className="ec-experiencias--columna" />
            <p className="ec-texto-2 ec-chico ec-filtros__nota">Consultá en recepción por excursiones y reservas con operadores locales.</p>
            <Boton to="/web/habitaciones#buscar" className="ec-revelar">
              Reservá tu estadía
            </Boton>
          </div>
        </div>
      </section>
    </div>
  );
}
