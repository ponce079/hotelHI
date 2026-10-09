import { Boton } from "../componentes/Boton";
import { FotoWeb, ListaExperiencias, Portada } from "../componentes/PiezasWeb";
import { useRevelar } from "../useRevelar";
import { useTituloPagina } from "../useTituloPagina";

// /web/experiencias — qué hacer en Salta durante la estadía (contenido del modelo).
export function ExperienciasPage() {
  useTituloPagina("Experiencias en Salta");
  const raiz = useRevelar();
  return (
    <div ref={raiz}>
      <Portada chica foto="e3" idTitulo="ec-titulo-experiencias-pagina" titulo="Experiencias en Salta" bajada="Paisajes, cultura y tradición." />

      <section className="ec-contenedor ec-seccion" aria-label="Experiencias">
        <div className="ec-experiencias-pagina">
          <div className="ec-experiencias-pagina__foto ec-revelar">
            <FotoWeb nombre="cac" alt="Cardones en los Valles Calchaquíes" />
          </div>
          <div>
            <p className="ec-sobretitulo ec-revelar">Salta a tu medida</p>
            <h2 className="ec-titulo-seccion ec-revelar">Montañas, cultura y tradición viva</h2>
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
