import { TarjetaIndicador } from "../../../componentes/TarjetaIndicador";

const TERRACOTA_OSCURO = "font-semibold text-[var(--aviso-texto)]";
const hacia = (vista) => ({ texto: "Ver →", to: `/check-in?vista=${vista}` });

// Cuatro indicadores del día, siempre sin el filtro de búsqueda. `indicadores` viene de calcularIndicadores();
// null mientras carga o si el pedido falló (las tarjetas muestran "—").
export function IndicadoresLlegadas({ indicadores }) {
  const i = indicadores;
  const avance = i && i.totalHoy > 0 ? Math.round((i.ingresadas / i.totalHoy) * 100) : 0;
  return (
    <section aria-label="Indicadores de llegadas" className="grilla-indicadores">
      <TarjetaIndicador
        color="var(--terracota)"
        etiqueta="Llegadas de hoy"
        valor={
          i ? (
            <>
              {i.ingresadas}
              <span className="ml-2 text-[28px] text-piedra">de {i.totalHoy}</span>
            </>
          ) : null
        }
        secundaria={
          <>
            <span
              role="progressbar"
              aria-label="Avance de las llegadas de hoy"
              aria-valuemin={0}
              aria-valuemax={i?.totalHoy ?? 0}
              aria-valuenow={i?.ingresadas ?? 0}
              className="mb-2 block h-1.5 overflow-hidden rounded-full bg-neutro-100"
            >
              <span className="block h-full rounded-full bg-pino" style={{ width: `${avance}%` }} />
            </span>
            {i ? `ingresadas · ${i.pendientes} ${i.pendientes === 1 ? "pendiente" : "pendientes"}` : "ingresadas · pendientes"}
          </>
        }
      />
      <TarjetaIndicador
        color="var(--aviso-texto)"
        etiqueta="Habitaciones no listas"
        valor={i ? i.noListas.length : null}
        enlace={hacia("pendientes")}
        secundaria={
          i && i.noListas.length > 0 ? (
            <span className={TERRACOTA_OSCURO}>
              {i.noListasVisibles.map((h) => h.texto).join(" · ")}
              {i.noListasExtra > 0 && ` · +${i.noListasExtra}`}
            </span>
          ) : (
            "las habitaciones de las llegadas están listas"
          )
        }
      />
      <TarjetaIndicador
        color="var(--laton-600, #b08a3a)"
        etiqueta="Sin garantía"
        valor={i ? i.sinGarantia : null}
        enlace={hacia("pendientes")}
        secundaria="tomar tarjeta al ingreso"
      />
      <TarjetaIndicador
        color="var(--terracota)"
        etiqueta="Llegadas atrasadas"
        valor={i ? i.atrasadas : null}
        enlace={hacia("atrasadas")}
        secundaria="de ayer · todavía se pueden ingresar"
      />
    </section>
  );
}
