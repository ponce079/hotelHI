import { Link } from "react-router-dom";
import { Clock, Users } from "lucide-react";
import { FotoEjemplo } from "./FotoEjemplo";
import { HOTEL } from "../ecommerce.config";
import { contenidoDeTipo } from "../ecommerce.contenido";
import {
  LEYENDA_PRECIO_FINAL,
  formatearFecha,
  formatearPrecio,
  textoCondicionesPlan,
  textoNoches,
  textoOcupacion,
  calcularNoches,
} from "../formato";

function sumarOcupacion(ocupacion = []) {
  return ocupacion.reduce(
    (acc, h) => ({ adultos: acc.adultos + Number(h.adultos || 0), menores: acc.menores + Number(h.menores || 0) }),
    { adultos: 0, menores: 0 }
  );
}

// Panel lateral "Tu reserva": tipo, fechas, noches, ocupación, plan con sus
// condiciones y total con la leyenda de IVA. Sin número de habitación ni
// piso. Recibe todo por props (las páginas lo leen de useProcesoCompra()).
export function ResumenReserva({ tipo, fechaDesde, fechaHasta, ocupacion, plan, total, enlaceModificar = "/web/resultados" }) {
  const noches = calcularNoches(fechaDesde, fechaHasta);
  const contenido = contenidoDeTipo(tipo?.nombre);
  const totalMostrado = total ?? plan?.total;

  return (
    <aside className="ec-tarjeta ec-resumen" aria-label="Resumen de tu reserva">
      <FotoEjemplo texto={contenido.fotos[0]} />
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

        {plan && (
          <div className="ec-resumen__plan">
            <p className="ec-plan__nombre">{plan.nombre}</p>
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
