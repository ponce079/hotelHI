import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Users } from "lucide-react";
import { FotoEjemplo } from "./FotoEjemplo";
import { HOTEL } from "../ecommerce.config";
import { contenidoDeTipo, fotoDeTipo } from "../ecommerce.contenido";
import { useDesgloseNoches } from "../ProcesoCompraContext";
import {
  LEYENDA_PRECIO_FINAL,
  formatearFecha,
  formatearPrecio,
  nombreComercialPlan,
  textoCondicionesPlan,
  textoNoches,
  textoOcupacion,
  calcularNoches,
} from "../formato";

// Con más de 4 noches se muestran las primeras 3 y el resto se despliega con un botón.
const MAX_NOCHES_VISIBLES = 4;
const NOCHES_AL_COLAPSAR = 3;

// Precio final de cada noche ("Vie 13 nov · $ 40.000"). Sin `noches` en la cotización, no muestra nada.
function DesgloseNoches({ noches }) {
  const [abierto, setAbierto] = useState(false);
  const idLista = useId();
  if (!Array.isArray(noches) || noches.length === 0) return null;
  const colapsable = noches.length > MAX_NOCHES_VISIBLES;
  const visibles = colapsable && !abierto ? noches.slice(0, NOCHES_AL_COLAPSAR) : noches;
  return (
    <div className="ec-desglose">
      <ul id={idLista} className="ec-desglose__lista" aria-label="Precio de cada noche">
        {visibles.map((n) => (
          <li key={n.fecha}>
            {formatearFecha(n.fecha, { conAnio: false })} · {formatearPrecio(n.precio)}
          </li>
        ))}
      </ul>
      {colapsable && (
        <button type="button" className="ec-desglose__ver" aria-expanded={abierto} aria-controls={idLista} onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Ver menos" : `Ver las ${noches.length} noches`}
        </button>
      )}
    </div>
  );
}

function sumarOcupacion(ocupacion = []) {
  return ocupacion.reduce(
    (acc, h) => ({ adultos: acc.adultos + Number(h.adultos || 0), menores: acc.menores + Number(h.menores || 0) }),
    { adultos: 0, menores: 0 }
  );
}

// Panel lateral "Tu reserva": tipo, fechas, noches, ocupación, plan con sus
// condiciones y total con la leyenda de IVA. Sin número de habitación ni
// piso. Recibe todo por props (las páginas lo leen de useProcesoCompra()).
// `desglose` (opcional): [{ fecha, precio }]; si no se pasa, se lee de la cotización del proceso de compra.
export function ResumenReserva({ tipo, fechaDesde, fechaHasta, ocupacion, plan, total, desglose, enlaceModificar = "/web/resultados" }) {
  const desgloseDelProceso = useDesgloseNoches();
  const noches = calcularNoches(fechaDesde, fechaHasta);
  const contenido = contenidoDeTipo(tipo?.nombre);
  const totalMostrado = total ?? plan?.total;

  return (
    <aside className="ec-tarjeta ec-resumen" aria-label="Resumen de tu reserva">
      <FotoEjemplo texto={contenido.fotos[0]} src={fotoDeTipo(tipo?.nombre)} />
      <div className="ec-resumen__cuerpo">
        <div className="ec-resumen__encabezado">
          <div>
            <p className="ec-sobretitulo">Tu reserva</p>
            <h2>Habitación {tipo?.nombre}</h2>
            {tipo?.capacidadMaxima && <p className="ec-texto-2 ec-chico">Hasta {tipo.capacidadMaxima} personas</p>}
          </div>
          {enlaceModificar && (
            <Link to={enlaceModificar} className="ec-chico" aria-label="Modificar la habitación o el plan">
              Modificar
            </Link>
          )}
        </div>

        <div className="ec-resumen__fechas">
          <div className="ec-resumen__fecha">
            <p className="ec-resumen__etiqueta">Entrada</p>
            <p className="ec-resumen__valor">{formatearFecha(fechaDesde)}</p>
            <p className="ec-texto-2 ec-chico">desde las {HOTEL.checkIn}</p>
          </div>
          <div className="ec-resumen__fecha">
            <p className="ec-resumen__etiqueta">Salida</p>
            <p className="ec-resumen__valor">{formatearFecha(fechaHasta)}</p>
            <p className="ec-texto-2 ec-chico">hasta las {HOTEL.checkOut}</p>
          </div>
        </div>

        <div className="ec-fila ec-texto-2">
          <span className="ec-fila">
            <Clock size={18} strokeWidth={1.7} aria-hidden="true" /> {textoNoches(noches)}
          </span>
          <span className="ec-fila">
            <Users size={18} strokeWidth={1.7} aria-hidden="true" /> {textoOcupacion(sumarOcupacion(ocupacion))}
          </span>
        </div>

        <DesgloseNoches noches={desglose ?? desgloseDelProceso} />

        {plan && (
          <div className="ec-resumen__plan">
            <p className="ec-plan__nombre">{nombreComercialPlan(plan)}</p>
            <p className={`ec-plan__condiciones ${plan.reembolsable ? "" : "ec-plan__condiciones--nrf"}`.trim()}>
              {textoCondicionesPlan(plan)}
            </p>
          </div>
        )}

        <div>
          <div className="ec-resumen__total">
            <span className="ec-resumen__valor">Total</span>
            <span className="ec-resumen__monto">{formatearPrecio(totalMostrado)}</span>
          </div>
          <p className="ec-texto-2 ec-chico">{LEYENDA_PRECIO_FINAL}</p>
        </div>
      </div>
    </aside>
  );
}

// Barra fija al pie en móvil con el total y el botón principal del paso
// (en escritorio no se muestra; ver .ec-barra-movil en ecommerce.css).
export function BarraTotalMovil({ total, children }) {
  return (
    <div className="ec-barra-movil">
      <div>
        <p className="ec-barra-movil__monto">{formatearPrecio(total)}</p>
        <p className="ec-barra-movil__leyenda">IVA incluido</p>
      </div>
      {children}
    </div>
  );
}
