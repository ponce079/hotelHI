import { ArrowLeft, ArrowRight } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { IndicadorPasos } from "../componentes/IndicadorPasos";
import { BarraTotalMovil, ResumenReserva } from "../componentes/ResumenReserva";
import { Tarjeta } from "../componentes/Tarjeta";
import { useProcesoCompra } from "../ProcesoCompraContext";

// /web/datos — Responsable: Tomás. ESQUELETO con el layout correcto
// (mockup pág. 4). Ver docs/ecommerce/CONTRATO.md.
//
// TODO Tomás — formulario del titular (decisión de diseño 8): nombre,
// apellido, tipo de documento (TIPOS_DOCUMENTO), número de documento,
// email, teléfono (obligatorio), nacionalidad y país de residencia (PAISES,
// ISO alfa-2), hora estimada de llegada (HORAS_LLEGADA, con el texto "El
// check-in es desde las 14 h. Tu habitación está garantizada aunque llegues
// tarde.") y solicitudes especiales (opcional, MAX_SOLICITUDES). Sin
// "Huésped 2" ni servicios adicionales. Guardar con actualizarHuesped,
// actualizarLlegada y actualizarSolicitudes del contexto.
export function DatosHuespedPage() {
  const { tipo, plan, cotizacion, fechaDesde, fechaHasta, ocupacion } = useProcesoCompra();
  const total = cotizacion?.total ?? plan?.total;

  return (
    <div className="ec-contenedor ec-compra">
      <IndicadorPasos actual={2} />
      <div className="ec-compra__grilla">
        <div className="ec-compra__formulario">
          <h1 className="ec-titulo-pagina">Completá tus datos</h1>
          <Tarjeta relleno className="ec-pila">
            <h2 className="ec-titulo-seccion">Titular de la reserva</h2>
            <p className="ec-responsable">Responsable: Tomás — ver docs/ecommerce/CONTRATO.md</p>
          </Tarjeta>
          <div className="ec-compra__navegacion">
            <Boton variante="texto" to="/web/resultados">
              <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> Volver a la habitación
            </Boton>
            <Boton to="/web/pago">
              Continuar al pago <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
            </Boton>
          </div>
        </div>
        <div className="ec-compra__lateral">
          <ResumenReserva tipo={tipo} plan={plan} total={total} fechaDesde={fechaDesde} fechaHasta={fechaHasta} ocupacion={ocupacion} />
        </div>
      </div>
      <BarraTotalMovil total={total}>
        <Boton to="/web/pago">Continuar</Boton>
      </BarraTotalMovil>
    </div>
  );
}
