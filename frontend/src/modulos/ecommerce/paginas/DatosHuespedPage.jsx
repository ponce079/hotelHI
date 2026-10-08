import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Mail, Phone, User } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { CampoFecha } from "../componentes/CampoFecha";
import { IndicadorPasos } from "../componentes/IndicadorPasos";
import { BarraTotalMovil, ResumenReserva } from "../componentes/ResumenReserva";
import { Tarjeta } from "../componentes/Tarjeta";
import { hoyEnHoraLocal } from "../../../lib/fechas";
import { textoNoShow } from "../busquedaWeb";
import { HOTEL } from "../ecommerce.config";
import {
  ETIQUETAS_NUMERO_DOCUMENTO,
  HORAS_LLEGADA,
  MAX_SOLICITUDES,
  TIPOS_DOCUMENTO,
  VERSION_POLITICAS,
  nombrePais,
} from "../ecommerce.constantes";
import { MAX_DOCUMENTO, MAX_NOMBRE, PAISES_POR_NOMBRE, rutaResultados, validarHuesped, validarSolicitudes } from "../datosCompra";
import { nombreComercialPlan, textoCondicionesPlan } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";
import { useTituloPagina } from "../useTituloPagina";

// /web/datos — Responsable: Tomás (HU-101). Titular de la reserva (la ficha
// Huesped del sistema, CONTRATO.md → "Huésped (titular)"), hora estimada de
// llegada, solicitudes especiales y consentimiento (términos + política de
// cancelación + privacidad, Ley 25.326) con el opt-in de comunicaciones
// aparte, opcional y sin tildar. Sin "Huésped 2", servicios adicionales ni
// cuentas (decisiones de diseño).
//
// Los datos se guardan en el contexto a medida que se escriben (así un F5 o
// "Volver" desde el pago no los pierden). Nunca hay datos de tarjeta acá.

const FORMULARIO = "ec-form-datos";
const idCampo = (campo) => `ec-datos-${campo}`;

// Orden en el que se enfoca el primer campo con error.
const ORDEN_CAMPOS = [
  "nombres",
  "apellido",
  "tipoDocumento",
  "paisDocumento",
  "numeroDocumento",
  "fechaNacimiento",
  "email",
  "telefono",
  "nacionalidad",
  "paisResidencia",
  "llegada",
  "solicitudesEspeciales",
  "consentimiento",
];

// Atajo "Usar <país del documento>": link chico debajo del select.
const ESTILO_ATAJO = { alignSelf: "flex-start", fontSize: 14 };

const MENSAJE_CONSENTIMIENTO = "Para continuar, aceptá los términos de la reserva y las políticas.";

function OpcionesPaises() {
  return PAISES_POR_NOMBRE.map(([codigo, nombre]) => (
    <option key={codigo} value={codigo}>
      {nombre}
    </option>
  ));
}

export function DatosHuespedPage() {
  useTituloPagina("Tus datos");
  const navigate = useNavigate();
  const location = useLocation();
  const proceso = useProcesoCompra();
  const { tipo, plan, cotizacion, fechaDesde, fechaHasta, ocupacion, huesped, llegada, solicitudesEspeciales, consentimiento } = proceso;
  const total = cotizacion?.total ?? plan?.total;
  const hoy = hoyEnHoraLocal();

  // Error de un campo que marcó el servidor al confirmar en el pago
  // (DATOS_INVALIDOS con `campo`): llega por el state de la navegación.
  const errorDelServidor = location.state?.errorServidor;
  const [erroresServidor, setErroresServidor] = useState(() =>
    errorDelServidor?.campo ? { [errorDelServidor.campo]: errorDelServidor.mensaje } : {}
  );
  // `revisar`: el pago mandó de vuelta porque faltaban datos → se marcan todos.
  const [intentoContinuar, setIntentoContinuar] = useState(Boolean(errorDelServidor?.campo || location.state?.revisar));
  const [tocados, setTocados] = useState({});

  const errores = useMemo(() => {
    const encontrados = validarHuesped(huesped, { fechaDesde, hoy });
    const errorSolicitudes = validarSolicitudes(solicitudesEspeciales);
    if (errorSolicitudes) encontrados.solicitudesEspeciales = errorSolicitudes;
    if (!consentimiento.aceptaPoliticas) encontrados.consentimiento = MENSAJE_CONSENTIMIENTO;
    return encontrados;
  }, [huesped, fechaDesde, hoy, solicitudesEspeciales, consentimiento.aceptaPoliticas]);

  // El error se muestra después de salir del campo o de intentar continuar.
  // El consentimiento se marca recién al intentar continuar.
  function errorDe(campo) {
    if (erroresServidor[campo]) return erroresServidor[campo];
    if (!intentoContinuar && (!tocados[campo] || campo === "consentimiento")) return undefined;
    return errores[campo];
  }

  // Si vino un error del servidor, se enfoca ese campo (solo al entrar).
  const campoAEnfocar = useRef(errorDelServidor?.campo);
  useEffect(() => {
    if (campoAEnfocar.current) document.getElementById(idCampo(campoAEnfocar.current))?.focus?.();
  }, []);

  const tocar = (campo) => () => setTocados((t) => (t[campo] ? t : { ...t, [campo]: true }));

  function limpiarErrorServidor(campo) {
    setErroresServidor((e) => {
      if (!(campo in e)) return e;
      const { [campo]: _quitado, ...resto } = e;
      return resto;
    });
  }

  const cambiarHuesped = (campo) => (evento) => {
    limpiarErrorServidor(campo);
    proceso.actualizarHuesped({ [campo]: evento.target.value });
  };

  function usarPaisDocumento(campo) {
    limpiarErrorServidor(campo);
    proceso.actualizarHuesped({ [campo]: huesped.paisDocumento });
  }

  function continuar(evento) {
    evento.preventDefault();
    setIntentoContinuar(true);
    const conError = ORDEN_CAMPOS.filter((campo) => errores[campo] || erroresServidor[campo]);
    if (conError.length > 0) {
      const primero = conError[0];
      document.getElementById(idCampo(primero))?.focus?.();
      return;
    }
    // Normaliza espacios antes de seguir (el backend también lo hace).
    proceso.actualizarHuesped({
      nombres: huesped.nombres.trim().replace(/\s+/g, " "),
      apellido: huesped.apellido.trim().replace(/\s+/g, " "),
      numeroDocumento: huesped.numeroDocumento.trim(),
      email: huesped.email.trim(),
      telefono: huesped.telefono.trim(),
    });
    navigate("/web/pago");
  }

  const cantidadErrores = intentoContinuar ? ORDEN_CAMPOS.filter((c) => errorDe(c)).length : 0;
  const etiquetaNumero = ETIQUETAS_NUMERO_DOCUMENTO[huesped.tipoDocumento] ?? "Número de documento";
  const paisDocumentoNombre = nombrePais(huesped.paisDocumento);
  const largoSolicitudes = (solicitudesEspeciales ?? "").length;
  const volverA = rutaResultados({ fechaDesde, fechaHasta, ocupacion });

  return (
    <div className="ec-contenedor ec-compra">
      <IndicadorPasos actual={2} />
      <div className="ec-compra__grilla">
        <form id={FORMULARIO} className="ec-compra__formulario" onSubmit={continuar} noValidate aria-labelledby="ec-datos-titulo">
          <h1 id="ec-datos-titulo" className="ec-titulo-pagina">
            Completá tus datos
          </h1>

          {cantidadErrores > 0 && (
            <div className="ec-alerta ec-alerta--error" role="alert">
              <div>
                <p className="ec-alerta__titulo">Revisá los datos marcados</p>
                <p>
                  {cantidadErrores === 1 ? "Hay 1 campo para corregir." : `Hay ${cantidadErrores} campos para corregir.`}
                </p>
              </div>
            </div>
          )}

          <Tarjeta relleno className="ec-pila">
            <div>
              <h2 className="ec-titulo-seccion">Titular de la reserva</h2>
              <p className="ec-texto-2">
                Usamos estos datos para la reserva y el registro en el check-in. Los campos con * son obligatorios.
              </p>
            </div>

            <div className="ec-grilla-2">
              <Campo
                id={idCampo("nombres")}
                label="Nombre"
                requerido
                autoComplete="given-name"
                placeholder="Ej.: María José"
                maxLength={MAX_NOMBRE}
                Icono={User}
                value={huesped.nombres}
                onChange={cambiarHuesped("nombres")}
                onBlur={tocar("nombres")}
                error={errorDe("nombres")}
              />
              <Campo
                id={idCampo("apellido")}
                label="Apellido"
                requerido
                autoComplete="family-name"
                placeholder="Ej.: González"
                maxLength={MAX_NOMBRE}
                value={huesped.apellido}
                onChange={cambiarHuesped("apellido")}
                onBlur={tocar("apellido")}
                error={errorDe("apellido")}
              />

              <Campo
                id={idCampo("tipoDocumento")}
                como="select"
                label="Tipo de documento"
                requerido
                value={huesped.tipoDocumento}
                onChange={cambiarHuesped("tipoDocumento")}
                onBlur={tocar("tipoDocumento")}
                error={errorDe("tipoDocumento")}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Campo>
              <Campo
                id={idCampo("paisDocumento")}
                como="select"
                label="País que emitió el documento"
                requerido
                value={huesped.paisDocumento}
                onChange={cambiarHuesped("paisDocumento")}
                onBlur={tocar("paisDocumento")}
                error={errorDe("paisDocumento")}
              >
                <option value="">Elegí un país</option>
                <OpcionesPaises />
              </Campo>

              <Campo
                id={idCampo("numeroDocumento")}
                label={etiquetaNumero}
                requerido
                autoComplete="off"
                maxLength={MAX_DOCUMENTO}
                inputMode={huesped.tipoDocumento === "DNI" ? "numeric" : undefined}
                value={huesped.numeroDocumento}
                onChange={cambiarHuesped("numeroDocumento")}
                onBlur={tocar("numeroDocumento")}
                error={errorDe("numeroDocumento")}
              />
              <CampoFecha
                id={idCampo("fechaNacimiento")}
                label="Fecha de nacimiento *"
                required
                autoComplete="bday"
                max={hoy}
                value={huesped.fechaNacimiento}
                onChange={cambiarHuesped("fechaNacimiento")}
                onBlur={tocar("fechaNacimiento")}
                error={errorDe("fechaNacimiento")}
                ayuda="El titular tiene que ser mayor de 18 años."
              />

              <Campo
                id={idCampo("email")}
                label="Email"
                type="email"
                requerido
                autoComplete="email"
                placeholder="nombre@correo.com"
                Icono={Mail}
                value={huesped.email}
                onChange={cambiarHuesped("email")}
                onBlur={tocar("email")}
                error={errorDe("email")}
                ayuda="Te enviamos la confirmación y el código de la reserva."
              />
              <Campo
                id={idCampo("telefono")}
                label="Teléfono"
                type="tel"
                requerido
                autoComplete="tel"
                placeholder="+54 9 387 ..."
                maxLength={40}
                Icono={Phone}
                value={huesped.telefono}
                onChange={cambiarHuesped("telefono")}
                onBlur={tocar("telefono")}
                error={errorDe("telefono")}
                ayuda="Con código de país y de área."
              />

              <div className="ec-pila ec-pila--chica">
                <Campo
                  id={idCampo("nacionalidad")}
                  como="select"
                  label="Nacionalidad"
                  value={huesped.nacionalidad}
                  onChange={cambiarHuesped("nacionalidad")}
                  onBlur={tocar("nacionalidad")}
                  error={errorDe("nacionalidad")}
                >
                  <option value="">Elegí un país</option>
                  <OpcionesPaises />
                </Campo>
                {paisDocumentoNombre && huesped.nacionalidad !== huesped.paisDocumento && (
                  <Boton
                    variante="texto"
                    style={ESTILO_ATAJO}
                    onClick={() => usarPaisDocumento("nacionalidad")}
                    aria-label={`Usar ${paisDocumentoNombre}, el país del documento, como nacionalidad`}
                  >
                    Usar {paisDocumentoNombre} (país del documento)
                  </Boton>
                )}
              </div>
              <div className="ec-pila ec-pila--chica">
                <Campo
                  id={idCampo("paisResidencia")}
                  como="select"
                  label="País de residencia"
                  value={huesped.paisResidencia}
                  onChange={cambiarHuesped("paisResidencia")}
                  onBlur={tocar("paisResidencia")}
                  error={errorDe("paisResidencia")}
                >
                  <option value="">Elegí un país</option>
                  <OpcionesPaises />
                </Campo>
                {paisDocumentoNombre && huesped.paisResidencia !== huesped.paisDocumento && (
                  <Boton
                    variante="texto"
                    style={ESTILO_ATAJO}
                    onClick={() => usarPaisDocumento("paisResidencia")}
                    aria-label={`Usar ${paisDocumentoNombre}, el país del documento, como país de residencia`}
                  >
                    Usar {paisDocumentoNombre} (país del documento)
                  </Boton>
                )}
              </div>
            </div>
            <p className="ec-texto-2 ec-chico">
              Nacionalidad y país de residencia son opcionales: si no los completás ahora, te los pedimos en el check-in.
            </p>
          </Tarjeta>

          <Tarjeta relleno className="ec-pila">
            <h2 className="ec-titulo-seccion">Tu llegada</h2>
            <Campo
              id={idCampo("llegada")}
              como="select"
              label="Hora estimada de llegada"
              value={llegada.horaEstimada}
              onChange={(e) => {
                limpiarErrorServidor("llegada");
                proceso.actualizarLlegada(e.target.value);
              }}
              error={errorDe("llegada")}
              ayuda={`El check-in es desde las ${HOTEL.checkIn}. Tu habitación está garantizada aunque llegues tarde.`}
            >
              {HORAS_LLEGADA.map((h) => (
                <option key={h.valor} value={h.valor}>
                  {h.etiqueta}
                </option>
              ))}
            </Campo>
            <Campo
              id={idCampo("solicitudesEspeciales")}
              como="textarea"
              label="Solicitudes especiales (opcional)"
              placeholder="Ej.: cuna para bebé, piso bajo, llegada tarde…"
              maxLength={MAX_SOLICITUDES}
              value={solicitudesEspeciales}
              onChange={(e) => {
                limpiarErrorServidor("solicitudesEspeciales");
                proceso.actualizarSolicitudes(e.target.value);
              }}
              onBlur={tocar("solicitudesEspeciales")}
              error={errorDe("solicitudesEspeciales")}
              ayuda={`Las pasamos a recepción. Hacemos lo posible, pero no podemos garantizarlas. ${largoSolicitudes}/${MAX_SOLICITUDES} caracteres.`}
            />
          </Tarjeta>

          <Tarjeta relleno className="ec-pila">
            <h2 className="ec-titulo-seccion">Términos y privacidad</h2>
            <details className="ec-texto-2">
              <summary>Leer los términos de la reserva, la política de cancelación y la de privacidad</summary>
              <div className="ec-pila ec-pila--chica" style={{ marginTop: 12 }}>
                <p>
                  <strong>Términos de la reserva.</strong> La reserva es por el tipo de habitación, las fechas y la cantidad de
                  huéspedes elegidos; el hotel asigna la habitación. Check-in desde las {HOTEL.checkIn} y check-out hasta las{" "}
                  {HOTEL.checkOut}. El titular tiene que ser mayor de 18 años y presentar en el check-in el documento declarado.
                  Los precios son en pesos argentinos, con IVA incluido.
                </p>
                <p>
                  <strong>Política de cancelación ({nombreComercialPlan(plan)}).</strong> {textoCondicionesPlan(plan)}.{" "}
                  {plan?.reembolsable
                    ? "La tarjeta de crédito garantiza la reserva: no se cobra nada ahora. Podés cancelar desde Mi reserva dentro del plazo."
                    : "Es una tarifa no reembolsable: no admite cancelación con devolución."}{" "}
                  {textoNoShow(plan?.penalidadNoShow)}
                </p>
                <p>
                  <strong>Privacidad (Ley 25.326).</strong> Usamos tus datos solo para gestionar tu reserva y tu estadía, incluido
                  el registro de pasajeros. No los compartimos con terceros, salvo obligación legal. Podés pedir el acceso, la
                  rectificación o la supresión de tus datos en recepción o por email. La Agencia de Acceso a la Información
                  Pública es el órgano de control de la Ley 25.326.
                </p>
                <p className="ec-chico">Versión {VERSION_POLITICAS}.</p>
              </div>
            </details>

            <div className="ec-pila ec-pila--chica">
              <label className="ec-check" htmlFor={idCampo("consentimiento")}>
                <input
                  id={idCampo("consentimiento")}
                  type="checkbox"
                  checked={consentimiento.aceptaPoliticas}
                  onChange={(e) => {
                    limpiarErrorServidor("consentimiento");
                    proceso.actualizarConsentimiento({ aceptaPoliticas: e.target.checked });
                  }}
                  aria-invalid={errorDe("consentimiento") ? true : undefined}
                  aria-describedby={errorDe("consentimiento") ? `${idCampo("consentimiento")}-error` : undefined}
                  required
                />
                <span>
                  Leí y acepto los términos de la reserva, la política de cancelación y la política de privacidad.{" "}
                  <span className="ec-campo__requerido" aria-hidden="true">
                    *
                  </span>
                </span>
              </label>
              {errorDe("consentimiento") && (
                <p id={`${idCampo("consentimiento")}-error`} className="ec-campo__error">
                  {errorDe("consentimiento")}
                </p>
              )}
            </div>

            <label className="ec-check" htmlFor={idCampo("comunicaciones")}>
              <input
                id={idCampo("comunicaciones")}
                type="checkbox"
                checked={consentimiento.aceptaComunicaciones}
                onChange={(e) => proceso.actualizarConsentimiento({ aceptaComunicaciones: e.target.checked })}
              />
              <span>Quiero recibir novedades y promociones del hotel por email (opcional).</span>
            </label>
          </Tarjeta>

          <div className="ec-compra__navegacion">
            <Boton variante="texto" to={volverA}>
              <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> Volver a las habitaciones
            </Boton>
            <Boton type="submit">
              Continuar al pago <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
            </Boton>
          </div>
        </form>
        <div className="ec-compra__lateral">
          <ResumenReserva tipo={tipo} plan={plan} total={total} fechaDesde={fechaDesde} fechaHasta={fechaHasta} ocupacion={ocupacion} />
        </div>
      </div>
      <BarraTotalMovil total={total}>
        <Boton type="submit" form={FORMULARIO}>
          Continuar
        </Boton>
      </BarraTotalMovil>
    </div>
  );
}
