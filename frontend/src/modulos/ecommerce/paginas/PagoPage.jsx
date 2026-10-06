import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Lock, ShieldCheck, User } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { IndicadorPasos } from "../componentes/IndicadorPasos";
import { MensajeError } from "../componentes/MensajeError";
import { BarraTotalMovil, ResumenReserva } from "../componentes/ResumenReserva";
import { Tarjeta } from "../componentes/Tarjeta";
import { hoyEnHoraLocal } from "../../../lib/fechas";
import { CODIGO_ERROR } from "../ecommerce.constantes";
import { crearReserva } from "../ecommerce.api";
import {
  NOMBRE_MARCA,
  datosListosParaPago,
  formatearNumeroTarjeta,
  formatearVencimiento,
  marcaTarjeta,
  rutaResultados,
  tarjetaParaEnviar,
  ubicarCampoServidor,
  validarTarjeta,
} from "../datosCompra";
import { formatearPrecio, textoCondicionesPlan } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";
import { useTituloPagina } from "../useTituloPagina";

// /web/pago — Responsable: Tomás (HU-102, pantalla). Solo tarjeta de
// crédito: sin cuotas, Mercado Pago, transferencia ni facturación
// (decisiones de diseño). Tarifa flexible → "Confirmar reserva" (la tarjeta
// garantiza, no se cobra); no reembolsable → "Pagar $ X".
//
// REGLA: el número, el vencimiento y el CVV viven SOLO en el estado local de
// esta página. Se pasan directo a crearReserva y se borran después de la
// respuesta (salga bien o mal). Nunca van al contexto ni a ningún storage.

const FORMULARIO = "ec-form-pago";
const TARJETA_VACIA = { titular: "", numero: "", vencimiento: "", cvv: "" };
const ORDEN_CAMPOS = ["numero", "titular", "vencimiento", "cvv"];
const idCampo = (campo) => `ec-pago-${campo}`;

export function PagoPage() {
  useTituloPagina("Pago");
  const navigate = useNavigate();
  const proceso = useProcesoCompra();
  const { tipo, plan, cotizacion, fechaDesde, fechaHasta, ocupacion, huesped, consentimiento, solicitudesEspeciales } = proceso;
  const total = cotizacion?.total ?? plan?.total;
  const hoy = hoyEnHoraLocal();

  const [tarjeta, setTarjeta] = useState(TARJETA_VACIA);
  const [tocados, setTocados] = useState({});
  const [intentoConfirmar, setIntentoConfirmar] = useState(false);
  const [erroresServidor, setErroresServidor] = useState({});
  const [error, setError] = useState(null);
  const [tarjetaBorrada, setTarjetaBorrada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Bloqueo sincrónico contra el doble clic (el estado tarda un render).
  const enviandoRef = useRef(false);
  const errorRef = useRef(null);

  const errores = useMemo(() => validarTarjeta(tarjeta, { hoy, fechaHasta }), [tarjeta, hoy, fechaHasta]);
  const marca = marcaTarjeta(tarjeta.numero);

  // Después de una respuesta con error: se muestra el mensaje y se enfoca el
  // campo que hay que volver a cargar.
  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    if ([CODIGO_ERROR.PAGO_RECHAZADO, CODIGO_ERROR.TARJETA_VENCE_ANTES].includes(error.codigo)) {
      document.getElementById(idCampo("numero"))?.focus?.();
    }
  }, [error]);

  // Sin titular válido o sin los términos aceptados no se puede pagar: vuelve
  // a "Tus datos" (por ejemplo, si se entra a /web/pago escribiendo la URL).
  if (!datosListosParaPago({ huesped, consentimiento, solicitudesEspeciales, fechaDesde, hoy })) {
    return <Navigate to="/web/datos" replace state={{ revisar: true }} />;
  }

  function errorDe(campo) {
    if (erroresServidor[campo]) return erroresServidor[campo];
    if (!intentoConfirmar && !tocados[campo]) return undefined;
    return errores[campo];
  }

  const tocar = (campo) => () => setTocados((t) => (t[campo] ? t : { ...t, [campo]: true }));

  function cambiar(campo, valor) {
    setErroresServidor((e) => {
      if (!(campo in e)) return e;
      const { [campo]: _quitado, ...resto } = e;
      return resto;
    });
    setTarjeta((t) => ({ ...t, [campo]: valor }));
  }

  async function confirmar(evento) {
    evento?.preventDefault();
    if (enviandoRef.current) return;
    setIntentoConfirmar(true);
    const conError = ORDEN_CAMPOS.filter((campo) => errores[campo]);
    if (conError.length > 0) {
      document.getElementById(idCampo(conError[0]))?.focus?.();
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    setErroresServidor({});
    setTarjetaBorrada(false);
    try {
      const cuerpo = proceso.armarCuerpoReserva({ tarjeta: tarjetaParaEnviar(tarjeta), totalEsperado: total });
      const resultado = await crearReserva(cuerpo);
      proceso.registrarResultado(resultado);
      navigate("/web/confirmacion", { replace: true });
    } catch (err) {
      // Clave nueva solo si la respuesta fue definitiva (CONTRATO.md → Idempotencia).
      proceso.tratarErrorReserva(err);
      if (err?.codigo === CODIGO_ERROR.PRECIO_CAMBIADO && err.totalNuevo != null) {
        proceso.actualizarCotizacion({ total: err.totalNuevo, promedioPorNoche: null, noches: null });
      }
      if (err?.codigo === CODIGO_ERROR.DATOS_INVALIDOS) {
        const ubicacion = ubicarCampoServidor(err.campo);
        if (ubicacion?.paso === "datos") {
          navigate("/web/datos", { state: { errorServidor: { campo: ubicacion.campo, mensaje: err.mensaje } } });
          return;
        }
        if (ubicacion?.paso === "pago") {
          setErroresServidor({ [ubicacion.campo]: err.mensaje || "Revisá este dato." });
          document.getElementById(idCampo(ubicacion.campo))?.focus?.();
          return;
        }
      }
      setError(err);
    } finally {
      // La tarjeta se borra SIEMPRE después de la respuesta (el nombre del
      // titular no es sensible y se conserva).
      setTarjeta((t) => ({ ...TARJETA_VACIA, titular: t.titular }));
      setTarjetaBorrada(true);
      setTocados({});
      setIntentoConfirmar(false);
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  const etiquetaBoton = plan?.reembolsable ? "Confirmar reserva" : `Pagar ${formatearPrecio(total)}`;
  const botonConfirmar = (
    <Boton type="submit" form={FORMULARIO} disabled={enviando} aria-busy={enviando || undefined}>
      {enviando ? "Procesando…" : etiquetaBoton} <Lock size={18} strokeWidth={1.8} aria-hidden="true" />
    </Boton>
  );

  return (
    <div className="ec-contenedor ec-compra">
      <IndicadorPasos actual={3} />
      <div className="ec-compra__grilla">
        <form id={FORMULARIO} className="ec-compra__formulario" onSubmit={confirmar} noValidate aria-labelledby="ec-pago-titulo">
          <h1 id="ec-pago-titulo" className="ec-titulo-pagina">
            Pago
          </h1>

          <Tarjeta relleno className="ec-pila">
            <div className="ec-fila">
              <User size={20} strokeWidth={1.7} aria-hidden="true" />
              <p>
                Titular:{" "}
                <strong>
                  {huesped.nombres} {huesped.apellido}
                </strong>{" "}
                <span className="ec-texto-2">· {huesped.email}</span>
              </p>
              <Link to="/web/datos" className="ec-chico" aria-label="Editar los datos del titular">
                Editar
              </Link>
            </div>
          </Tarjeta>

          <Tarjeta relleno className="ec-pila">
            <div>
              <h2 className="ec-titulo-seccion">Tarjeta de crédito</h2>
              <p className="ec-texto-2">Visa, Mastercard o American Express. Un solo pago, sin cuotas.</p>
            </div>

            {plan?.reembolsable ? (
              <div className="ec-alerta ec-alerta--info">
                <ShieldCheck size={20} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <p className="ec-alerta__titulo">Tu tarjeta solo garantiza la reserva: no se cobra nada ahora</p>
                  <p>{textoCondicionesPlan(plan)}.</p>
                </div>
              </div>
            ) : (
              <div className="ec-alerta ec-alerta--aviso">
                <CreditCard size={20} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <p className="ec-alerta__titulo">Se cobra el total ahora: {formatearPrecio(total)}</p>
                  <p>Tarifa no reembolsable: no admite cancelación con devolución.</p>
                </div>
              </div>
            )}

            {tarjetaBorrada && (error || Object.keys(erroresServidor).length > 0) && (
              <p className="ec-texto-2 ec-chico">Por seguridad borramos los datos de la tarjeta: volvé a ingresarlos.</p>
            )}

            <Campo
              id={idCampo("numero")}
              label="Número de tarjeta"
              requerido
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              maxLength={23}
              Icono={CreditCard}
              value={tarjeta.numero}
              onChange={(e) => cambiar("numero", formatearNumeroTarjeta(e.target.value))}
              onBlur={tocar("numero")}
              error={errorDe("numero")}
              ayuda={marca ? `Tarjeta ${NOMBRE_MARCA[marca]}` : undefined}
            />
            <Campo
              id={idCampo("titular")}
              label="Nombre como figura en la tarjeta"
              requerido
              autoComplete="cc-name"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={80}
              value={tarjeta.titular}
              onChange={(e) => cambiar("titular", e.target.value)}
              onBlur={tocar("titular")}
              error={errorDe("titular")}
            />
            <div className="ec-grilla-2">
              <Campo
                id={idCampo("vencimiento")}
                label="Vencimiento"
                requerido
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/AA"
                maxLength={5}
                value={tarjeta.vencimiento}
                onChange={(e) => cambiar("vencimiento", formatearVencimiento(e.target.value, tarjeta.vencimiento))}
                onBlur={tocar("vencimiento")}
                error={errorDe("vencimiento")}
              />
              <Campo
                id={idCampo("cvv")}
                label="Código de seguridad"
                requerido
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder={marca === "AMEX" ? "4 dígitos" : "CVV"}
                maxLength={4}
                value={tarjeta.cvv}
                onChange={(e) => cambiar("cvv", e.target.value.replace(/\D/g, ""))}
                onBlur={tocar("cvv")}
                error={errorDe("cvv")}
              />
            </div>
            <p className="ec-texto-2 ec-chico">
              <Lock size={16} strokeWidth={1.7} aria-hidden="true" style={{ verticalAlign: "-3px" }} /> El hotel no guarda el número completo de la tarjeta ni el
              código de seguridad.
            </p>
          </Tarjeta>

          <div ref={errorRef} className="ec-pila ec-pila--chica">
            <MensajeError error={error} />
            {error?.codigo === CODIGO_ERROR.SIN_DISPONIBILIDAD && (
              <div>
                <Boton variante="secundario" to={rutaResultados({ fechaDesde, fechaHasta, ocupacion })}>
                  Ver otras habitaciones
                </Boton>
              </div>
            )}
          </div>

          <div className="ec-compra__navegacion">
            <Boton variante="texto" to="/web/datos">
              <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> Volver a tus datos
            </Boton>
            {botonConfirmar}
          </div>
        </form>
        <div className="ec-compra__lateral">
          <ResumenReserva tipo={tipo} plan={plan} total={total} fechaDesde={fechaDesde} fechaHasta={fechaHasta} ocupacion={ocupacion} />
        </div>
      </div>
      <BarraTotalMovil total={total}>{botonConfirmar}</BarraTotalMovil>
    </div>
  );
}
