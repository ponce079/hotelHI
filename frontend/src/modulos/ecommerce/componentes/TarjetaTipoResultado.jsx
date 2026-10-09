import { ArrowRight, CircleAlert, Users } from "lucide-react";
import { Boton } from "./Boton";
import { FotoEjemplo } from "./FotoEjemplo";
import { Insignia } from "./Insignia";
import { Tarjeta } from "./Tarjeta";
import { ahorroContraFlexible, textoNoShow } from "../busquedaWeb";
import { contenidoDeTipo, fotoDeTipo } from "../ecommerce.contenido";
import { LEYENDA_PRECIO_FINAL, formatearPrecio, nombreComercialPlan, textoCondicionesPlan, textoNoches } from "../formato";

// Una fila por plan de un tipo (etapa 2): nombre comercial, condiciones,
// total, "$ X por noche · N noches", el ahorro calculado del no reembolsable
// y "Elegir". El nombre accesible del botón es "Elegir <plan> por $ X".
export function FilaPlanResultado({ plan, planes, noches, onElegir, cotizando = false, deshabilitado = false, etiquetaBoton = "Elegir" }) {
  const nombre = nombreComercialPlan(plan);
  const ahorro = ahorroContraFlexible(planes, plan);
  return (
    <div className="ec-plan ec-plan-fila">
      <div>
        <p className="ec-plan__nombre">{nombre}</p>
        <p className={`ec-plan__condiciones ${plan.reembolsable ? "" : "ec-plan__condiciones--nrf"}`.trim()}>
          {textoCondicionesPlan(plan)}
        </p>
        {textoNoShow(plan.penalidadNoShow) && <p className="ec-plan-fila__no-show">{textoNoShow(plan.penalidadNoShow)}</p>}
        {ahorro !== null && <p className="ec-plan-fila__ahorro">Ahorrás {formatearPrecio(ahorro)}</p>}
      </div>
      <div className="ec-plan__precio">
        <p className="ec-plan__total">{formatearPrecio(plan.total)}</p>
        <p className="ec-plan__detalle">
          {formatearPrecio(plan.promedioPorNoche)} por noche · {textoNoches(noches)}
        </p>
      </div>
      {onElegir && (
        <div className="ec-plan__accion">
          <Boton
            onClick={() => onElegir(plan)}
            disabled={deshabilitado || cotizando}
            aria-busy={cotizando || undefined}
            aria-label={`${etiquetaBoton} ${nombre} por ${formatearPrecio(plan.total)}`}
          >
            {cotizando ? (
              "Cotizando…"
            ) : (
              <>
                {etiquetaBoton} <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
              </>
            )}
          </Boton>
        </div>
      )}
    </div>
  );
}

// Tarjeta de un TIPO en /web/resultados: foto, nombre, capacidad,
// comodidades, "Últimas disponibles" y sus planes. Un tipo no disponible se
// muestra atenuado, con su motivo y sin botones.
export function TarjetaTipoResultado({ tipo, noches, onElegir, cotizando = null, bloqueado = false, error = null }) {
  const contenido = contenidoDeTipo(tipo.nombre);
  const disponible = tipo.planes.length > 0 && !tipo.motivoNoDisponible;
  const idTitulo = `ec-tipo-${tipo.tipoHabitacionId}`;
  return (
    <Tarjeta
      como="article"
      className="ec-resultado"
      deshabilitada={!disponible}
      aria-disabled={!disponible || undefined}
      aria-labelledby={idTitulo}
    >
      <FotoEjemplo texto={contenido.fotos[0]} src={fotoDeTipo(tipo.nombre)} />
      <div className="ec-resultado__cuerpo">
        <div className="ec-resultado__titulo">
          <h2 id={idTitulo}>{tipo.nombre}</h2>
          {disponible && tipo.ultimasDisponibles && <Insignia color="dorado">Últimas disponibles</Insignia>}
        </div>
        <p className="ec-fila ec-texto-2">
          <Users size={18} strokeWidth={1.7} aria-hidden="true" /> Hasta {tipo.capacidadMaxima} personas
          {disponible && tipo.desdePorNoche != null && (
            <span className="ec-resultado__desde">
              {" "}
              · Desde <strong>{formatearPrecio(tipo.desdePorNoche)}</strong> por noche
            </span>
          )}
        </p>
        <p className="ec-texto-2">{contenido.descripcion}</p>
        <ul className="ec-chips" aria-label="Comodidades">
          {contenido.comodidades.map(({ nombre, Icono }) => (
            <li key={nombre} className="ec-chip">
              <Icono size={18} strokeWidth={1.6} aria-hidden="true" /> {nombre}
            </li>
          ))}
        </ul>
        {error && (
          <p className="ec-alerta ec-alerta--aviso" role="alert">
            <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" /> {error}
          </p>
        )}
        {disponible ? (
          <div className="ec-resultado__planes">
            {tipo.planes.map((plan) => (
              <FilaPlanResultado
                key={plan.planTarifarioId}
                plan={plan}
                planes={tipo.planes}
                noches={noches}
                onElegir={(p) => onElegir(tipo, p)}
                cotizando={cotizando === `${tipo.tipoHabitacionId}:${plan.planTarifarioId}`}
                deshabilitado={bloqueado}
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
}
