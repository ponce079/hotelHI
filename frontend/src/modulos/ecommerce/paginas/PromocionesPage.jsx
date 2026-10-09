import { useState } from "react";
import { Boton } from "../componentes/Boton";
import { FotoWeb, Portada, TarjetaPromo } from "../componentes/PiezasWeb";
import { CATEGORIAS_PROMOCIONES, PROMOCIONES_WEB } from "../ecommerce.contenido";
import { useRevelar } from "../useRevelar";
import { useTituloPagina } from "../useTituloPagina";

// /web/promociones — promociones del modelo con solapas por categoría. Son contenido de
// difusión: el precio final lo calcula el motor de reservas con la tarifa vigente.
export function PromocionesPage() {
  useTituloPagina("Promociones");
  const raiz = useRevelar();
  const [categoria, setCategoria] = useState("Todas");
  const visibles = PROMOCIONES_WEB.filter((p) => categoria === "Todas" || p.categoria === categoria);

  return (
    <div ref={raiz}>
      <Portada chica foto="p1" idTitulo="ec-titulo-promociones-pagina" titulo="Promociones" bajada="Beneficios exclusivos para que disfrutes más tu estadía." />

      <div className="ec-solapas" role="group" aria-label="Filtrar promociones">
        <div className="ec-contenedor ec-solapas__interior">
          {CATEGORIAS_PROMOCIONES.map((c) => (
            <button
              key={c}
              type="button"
              className={`ec-solapa ${categoria === c ? "ec-solapa--activa" : ""}`.trim()}
              aria-pressed={categoria === c}
              onClick={() => setCategoria(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <section className="ec-contenedor ec-seccion" aria-label={`Promociones: ${categoria}`}>
        <div className="ec-grilla-promos">
          {visibles.map((promo, i) => (
            <TarjetaPromo key={promo.titulo} promo={promo} demora={i * 100} destino="/web/habitaciones#buscar" />
          ))}
        </div>
        <p className="ec-texto-2 ec-chico ec-filtros__nota">
          Beneficios sujetos a disponibilidad. El precio final se muestra al elegir fechas y habitación.
        </p>

        <div className="ec-banner-promo ec-revelar">
          <FotoWeb nombre="hab" />
          <div className="ec-banner-promo__texto">
            <p className="ec-banner-promo__sobretitulo">Promociones especiales</p>
            <h2>Feriado Largo</h2>
            <p>Más días para descubrir Salta.</p>
            <Boton variante="claro" to="/web/habitaciones#buscar">
              Ver habitaciones
            </Boton>
          </div>
        </div>
      </section>
    </div>
  );
}
