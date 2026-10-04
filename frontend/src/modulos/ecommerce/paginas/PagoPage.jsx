import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { IndicadorPasos } from "../componentes/IndicadorPasos";
import { MensajeError } from "../componentes/MensajeError";
import { BarraTotalMovil, ResumenReserva } from "../componentes/ResumenReserva";
import { Tarjeta } from "../componentes/Tarjeta";
import { CODIGO_ERROR } from "../ecommerce.constantes";
import { crearReserva, usarMock } from "../ecommerce.api";
import { formatearPrecio } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";

// /web/pago — Responsable: Tomás. ESQUELETO con el layout correcto
// (mockup pág. 5, con las decisiones de diseño: solo tarjeta de crédito,
// sin cuotas, sin Mercado Pago, sin transferencia, sin facturación).
// Ver docs/ecommerce/CONTRATO.md.
//
// REGLA: el número, el vencimiento y el CVV viven SOLO en el estado local
// de esta página. Se pasan directo a crearReserva y se limpian después de
// la respuesta. Nunca al contexto ni a ningún storage.

const TARJETA_VACIA = { titular: "", numero: "", vencimientoMes: "", vencimientoAnio: "", cvv: "" };

// Solo en modo simulado (usarMock() === true): datos de prueba para recorrer
// el flujo completo mientras no exista el formulario real.
const TARJETA_PRUEBA_MOCK = { titular: "HUESPED DE PRUEBA", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2030, cvv: "123" };
const HUESPED_PRUEBA_MOCK = {
  nombres: "Huésped",
  apellido: "De Prueba",
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "30111222",
  fechaNacimiento: "1990-05-20",
  email: "prueba@correo.com",
  telefono: "+54 9 387 555-0000",
  nacionalidad: "AR",
  paisResidencia: "AR",
};

export function PagoPage() {
  const navigate = useNavigate();
  const proceso = useProcesoCompra();
  const { tipo, plan, cotizacion, fechaDesde, fechaHasta, ocupacion, huesped } = proceso;
  const [tarjeta, setTarjeta] = useState(TARJETA_VACIA);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const modoSimulado = usarMock();
  const total = cotizacion?.total ?? plan?.total;

  async function confirmar() {
    // TODO Tomás: formulario real de tarjeta; nunca enviar datos de prueba al backend.
    if (!modoSimulado || enviando) return;
    // En el formulario real: const datosTarjeta = { ...tarjeta };
    const datosTarjeta = { ...tarjeta, ...TARJETA_PRUEBA_MOCK };
    setEnviando(true);
    setError(null);
    try {
      const cuerpo = proceso.armarCuerpoReserva({ tarjeta: datosTarjeta, totalEsperado: total });
      // Esqueleto: mientras /web/datos no cargue al titular, se usan datos de prueba.
      if (!huesped.nombres) cuerpo.huesped = { ...HUESPED_PRUEBA_MOCK };
      cuerpo.consentimiento = { ...cuerpo.consentimiento, aceptaPoliticas: true };
      const resultado = await crearReserva(cuerpo);
      proceso.registrarResultado(resultado);
      navigate("/web/confirmacion");
    } catch (err) {
      // Clave nueva solo si la respuesta fue definitiva (ver CONTRATO.md → Idempotencia).
      proceso.tratarErrorReserva(err);
      if (err.codigo === CODIGO_ERROR.PRECIO_CAMBIADO && err.totalNuevo != null) {
        proceso.actualizarCotizacion({ total: err.totalNuevo, promedioPorNoche: null, noches: null });
      }
      setError(err);
    } finally {
      setTarjeta(TARJETA_VACIA);
      setEnviando(false);
    }
  }

  const etiquetaBoton = plan?.reembolsable ? "Confirmar reserva" : `Pagar ${formatearPrecio(total)}`;
  const botonConfirmar = (
    <Boton onClick={confirmar} disabled={!modoSimulado || enviando} aria-busy={enviando || undefined}>
      {enviando ? "Procesando…" : etiquetaBoton} <Lock size={18} strokeWidth={1.8} aria-hidden="true" />
    </Boton>
  );

  return (
    <div className="ec-contenedor ec-compra">
      <IndicadorPasos actual={3} />
      <div className="ec-compra__grilla">
        <div className="ec-compra__formulario">
          <h1 className="ec-titulo-pagina">Pago</h1>
          <Tarjeta relleno className="ec-pila">
            <h2 className="ec-titulo-seccion">Tarjeta de crédito</h2>
            <p className="ec-responsable">Responsable: Tomás — ver docs/ecommerce/CONTRATO.md</p>
            {modoSimulado ? (
              <p className="ec-texto-2 ec-chico">Modo simulado: el botón crea una reserva de prueba con la tarjeta 4242 4242 4242 4242.</p>
            ) : (
              <p className="ec-texto-2 ec-chico">Formulario de tarjeta pendiente.</p>
            )}
          </Tarjeta>
          <MensajeError error={error} />
          {error?.codigo === CODIGO_ERROR.SIN_DISPONIBILIDAD && (
            <Boton variante="secundario" to="/web/resultados">
              Ver otras opciones
            </Boton>
          )}
          <p className="ec-texto-2">
            {plan?.reembolsable
              ? "No se cobra nada ahora. Tu tarjeta de crédito garantiza la reserva."
              : "Se cobra el total al reservar. Tarifa no reembolsable."}
          </p>
          <div className="ec-compra__navegacion">
            <Boton variante="texto" to="/web/datos">
              <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> Volver a tus datos
            </Boton>
            {botonConfirmar}
          </div>
        </div>
        <div className="ec-compra__lateral">
          <ResumenReserva tipo={tipo} plan={plan} total={total} fechaDesde={fechaDesde} fechaHasta={fechaHasta} ocupacion={ocupacion} />
        </div>
      </div>
      <BarraTotalMovil total={total}>{botonConfirmar}</BarraTotalMovil>
    </div>
  );
}
