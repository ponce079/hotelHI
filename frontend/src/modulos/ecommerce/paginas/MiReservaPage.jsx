import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, Info, Search } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { DialogoConfirmacion } from "../componentes/DialogoConfirmacion";
import { Insignia } from "../componentes/Insignia";
import { MensajeError } from "../componentes/MensajeError";
import { Tarjeta } from "../componentes/Tarjeta";
import { HOTEL } from "../ecommerce.config";
import { CODIGO_ERROR } from "../ecommerce.constantes";
import { cancelarMiReserva, consultarMiReserva } from "../ecommerce.api";
import {
  formatearInstanteHotel,
  formatearPrecio,
  formatearRangoFechas,
  nombreComercialPlan,
  textoCondicionesPlan,
  textoNoches,
  textoOcupacion,
} from "../formato";
import { useTituloPagina } from "../useTituloPagina";

// /web/mi-reserva — Responsable: Gimena (HU-104). Consulta con código de
// reserva + email (sin cuentas de huésped) y cancelación online SIN cargo.
// Todo lo demás (cancelar con cargo, modificar) se deriva a recepción.
// El código puede venir en ?codigo= (link del email); el email nunca viaja
// en la URL.

// Mismas reglas que el backend (miReserva.js): código de 8 caracteres
// hexadecimales sin espacios ni guiones; email en minúsculas sin espacios.
const normalizarCodigo = (valor) => String(valor ?? "").replace(/[\s-]/g, "").toUpperCase();
const normalizarEmail = (valor) => String(valor ?? "").replace(/\s/g, "").toLowerCase();
const CODIGO_VALIDO = /^[0-9A-F]{8}$/;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Color de la insignia (guía de estilo: el dorado es solo para "pendiente").
const COLOR_ESTADO = { Confirmada: "verde", "En curso": "verde", Cerrada: "neutro", Cancelada: "rojo", "No-show": "rojo" };
// Lo que ve el huésped: el estado interno "No-show" se muestra como "No presentada".
const ETIQUETA_ESTADO = { "No-show": "No presentada" };

const MOTIVO_CANCELADA = "Esta reserva ya fue cancelada.";

function textoPago({ cobrado, garantia }) {
  const tarjeta = garantia ? `${garantia.marca} ••${garantia.ultimos4}` : null;
  if (Number(cobrado) > 0) {
    return garantia?.tipo === "PREPAGO" ? `Pagado ${formatearPrecio(cobrado)} con ${tarjeta}` : `Cobrado ${formatearPrecio(cobrado)}`;
  }
  if (garantia) return `Garantizada con ${tarjeta}`;
  return "Sin pagos registrados";
}

export function MiReservaPage() {
  useTituloPagina("Mi reserva");
  const [searchParams] = useSearchParams();
  const [codigo, setCodigo] = useState(() => normalizarCodigo(searchParams.get("codigo")).slice(0, 8));
  const [email, setEmail] = useState("");
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [reserva, setReserva] = useState(null);
  const [consultando, setConsultando] = useState(false);
  // Código + email con los que se encontró la reserva (para cancelar y refrescar).
  const credenciales = useRef(null);

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState(null);
  const [cancelada, setCancelada] = useState(null); // { emailEnviado } tras cancelar desde acá

  async function consultar(evento) {
    evento.preventDefault();
    const codigoNormalizado = normalizarCodigo(codigo);
    const emailNormalizado = normalizarEmail(email);
    const encontrados = {};
    if (!codigoNormalizado) encontrados.codigo = "Ingresá el código de reserva.";
    else if (!CODIGO_VALIDO.test(codigoNormalizado)) encontrados.codigo = "El código tiene 8 caracteres, letras y números (por ejemplo, 3FA9C21B).";
    if (!emailNormalizado) encontrados.email = "Ingresá el email con el que reservaste.";
    else if (!EMAIL_VALIDO.test(emailNormalizado)) encontrados.email = "Ingresá un email válido.";
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    setConsultando(true);
    setError(null);
    setReserva(null);
    setCancelada(null);
    try {
      const datos = { codigo: codigoNormalizado, email: emailNormalizado };
      const encontrada = await consultarMiReserva(datos);
      credenciales.current = datos;
      setReserva(encontrada);
    } catch (err) {
      credenciales.current = null;
      setError(err);
    } finally {
      setConsultando(false);
    }
  }

  function abrirDialogo() {
    setErrorCancelacion(null);
    setDialogoAbierto(true);
  }

  async function confirmarCancelacion() {
    if (cancelando || !credenciales.current) return;
    setCancelando(true);
    setErrorCancelacion(null);
    try {
      const respuesta = await cancelarMiReserva({ ...credenciales.current, montoPenalidadAceptado: 0 });
      setReserva((actual) => ({
        ...actual,
        estado: "Cancelada",
        cancelacion: { puedeCancelarOnline: false, motivo: MOTIVO_CANCELADA, penalidad: null },
      }));
      setCancelada({ emailEnviado: respuesta?.email?.enviado !== false });
      setDialogoAbierto(false);
    } catch (err) {
      if (err?.codigo === CODIGO_ERROR.PENALIDAD_CAMBIO) {
        // Cambió algo desde la consulta (por ejemplo, pasó el plazo): se
        // vuelve a consultar y la tarjeta muestra el motivo nuevo.
        try {
          setReserva(await consultarMiReserva(credenciales.current));
          setDialogoAbierto(false);
        } catch (errConsulta) {
          setErrorCancelacion(errConsulta);
        }
      } else {
        setErrorCancelacion(err);
      }
    } finally {
      setCancelando(false);
    }
  }

  const cancelacion = reserva?.cancelacion;
  const limite = cancelacion?.penalidad?.limiteSinCargo ? formatearInstanteHotel(cancelacion.penalidad.limiteSinCargo) : "";

  return (
    <div className="ec-contenedor">
      <div className="ec-mi-reserva ec-pila">
        <p className="ec-sobretitulo">Mi reserva</p>
        <h1 className="ec-titulo-pagina">Consultá tu reserva</h1>
        <p className="ec-texto-2">Ingresá el código que recibiste por email y el email con el que reservaste.</p>

        <Tarjeta relleno>
          <form className="ec-pila" onSubmit={consultar} noValidate aria-label="Buscar reserva">
            <div className="ec-grilla-2">
              <Campo
                label="Código de reserva"
                requerido
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                error={errores.codigo}
              />
              <Campo
                label="Email"
                type="email"
                requerido
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errores.email}
              />
            </div>
            <div>
              <Boton type="submit" formulario disabled={consultando} aria-busy={consultando || undefined}>
                <Search size={18} strokeWidth={1.8} aria-hidden="true" /> {consultando ? "Buscando…" : "Buscar"}
              </Boton>
            </div>
          </form>
        </Tarjeta>

        <MensajeError error={error} />

        {reserva && (
          <Tarjeta relleno className="ec-pila ec-mi-reserva__tarjeta" aria-live="polite">
            <div className="ec-mi-reserva__cabecera">
              <h2 className="ec-titulo-seccion">Reserva {reserva.codigoConfirmacion}</h2>
              <Insignia estado={reserva.estado} color={COLOR_ESTADO[reserva.estado] ?? "neutro"}>
                {ETIQUETA_ESTADO[reserva.estado] ?? reserva.estado}
              </Insignia>
            </div>

            <dl className="ec-mi-reserva__datos">
              <div>
                <dt>Fechas</dt>
                <dd>
                  {formatearRangoFechas(reserva.fechaDesde, reserva.fechaHasta)}
                  <span className="ec-texto-2"> · {textoNoches(reserva.noches)}</span>
                </dd>
              </div>
              <div>
                <dt>{reserva.habitaciones.length === 1 ? "Habitación" : "Habitaciones"}</dt>
                <dd>
                  {reserva.habitaciones.map((h, i) => (
                    <span key={i} className="ec-mi-reserva__habitacion">
                      {h.tipo} · {textoOcupacion(h)}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Tarifa</dt>
                <dd>
                  {nombreComercialPlan(reserva.plan)}
                  <span className="ec-mi-reserva__condiciones ec-texto-2">{textoCondicionesPlan(reserva.plan)}</span>
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  <strong>{formatearPrecio(reserva.total)}</strong>
                  <span className="ec-mi-reserva__condiciones ec-texto-2">{textoPago(reserva)}</span>
                </dd>
              </div>
              <div>
                <dt>Titular</dt>
                <dd>
                  {reserva.titular} · Documento {reserva.documento}
                </dd>
              </div>
            </dl>

            {cancelada ? (
              <div className="ec-alerta ec-alerta--info" role="status">
                <CircleCheck size={20} strokeWidth={1.7} aria-hidden="true" />
                <p>
                  {cancelada.emailEnviado
                    ? "Reserva cancelada. Te enviamos la confirmación por email."
                    : "Reserva cancelada. No pudimos enviarte el email de confirmación; si lo necesitás, contactá a recepción."}
                </p>
              </div>
            ) : cancelacion?.puedeCancelarOnline ? (
              <div className="ec-mi-reserva__cancelar">
                {limite && <p className="ec-texto-2">Podés cancelar sin cargo hasta el {limite}.</p>}
                <Boton variante="texto" className="ec-enlace-peligro" onClick={abrirDialogo}>
                  Cancelar reserva
                </Boton>
              </div>
            ) : (
              cancelacion?.motivo && (
                <div className="ec-alerta ec-alerta--aviso" role="status">
                  <Info size={20} strokeWidth={1.7} aria-hidden="true" />
                  <div>
                    <p>{cancelacion.motivo}</p>
                    {reserva.estado !== "Cancelada" && <p>Teléfono de recepción: {HOTEL.telefono}</p>}
                  </div>
                </div>
              )
            )}
          </Tarjeta>
        )}
      </div>

      <DialogoConfirmacion
        abierto={dialogoAbierto}
        titulo="Cancelar reserva"
        textoConfirmar="Sí, cancelar"
        textoOcupado="Cancelando…"
        peligro
        ocupado={cancelando}
        onConfirmar={confirmarCancelacion}
        onCerrar={() => setDialogoAbierto(false)}
      >
        <p>Vas a cancelar tu reserva {reserva?.codigoConfirmacion}. No se realiza ningún cargo. ¿Confirmás?</p>
        <MensajeError error={errorCancelacion} />
      </DialogoConfirmacion>
    </div>
  );
}
