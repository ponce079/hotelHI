import { TarjetaIndicador } from "../../componentes/TarjetaIndicador";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const hacia = (vista) => ({ texto: "Ver →", to: `/check-out?vista=${vista}` });

// Tres indicadores, siempre de la lista completa (sin el filtro de búsqueda). `indicadores` viene de
// calcularIndicadores(); null mientras carga o si el pedido falló (las tarjetas muestran "—").
export function IndicadoresSalidas({ indicadores }) {
  const i = indicadores;
  return (
    <section aria-label="Indicadores de salidas" className="grilla-indicadores">
      <TarjetaIndicador
        color="var(--terracota)"
        etiqueta="Salen hoy"
        valor={i ? i.salenHoy : null}
        enlace={hacia("hoy")}
        secundaria="check-out previsto para hoy"
      />
      <TarjetaIndicador
        color="var(--aviso-texto)"
        etiqueta="Vencidas"
        valor={i ? i.vencidas : null}
        enlace={hacia("vencidas")}
        secundaria={<span className="font-semibold text-[var(--aviso-texto)]">check-out pendiente</span>}
      />
      <TarjetaIndicador
        color="var(--primary)"
        etiqueta="En casa"
        valor={i ? i.enCasa : null}
        enlace={hacia("todas")}
        secundaria={i ? plural(i.habitaciones, "habitación", "habitaciones") : ""}
      />
    </section>
  );
}
