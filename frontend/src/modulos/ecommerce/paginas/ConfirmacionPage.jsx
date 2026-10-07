import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarCheck, Check, Copy, MapPin, TriangleAlert } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { Insignia } from "../componentes/Insignia";
import { Tarjeta } from "../componentes/Tarjeta";
import { HOTEL } from "../ecommerce.config";
import { textoTarjeta } from "../datosCompra";
import {
  formatearFecha,
  formatearPrecio,
  nombreComercialPlan,
  textoCondicionesPlan,
  textoEstadoReserva,
  textoNoches,
  textoOcupacion,
} from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";
import { useTituloPagina } from "../useTituloPagina";

// /web/confirmacion — Responsable: Tomás (HU-103). Muestra la respuesta de
// POST /api/web/reservas (CONTRATO.md → "Para Tomás: Pago y Confirmación"):
// el código del sistema siempre; el aviso del email según email.enviado
// (true / false / null); la garantía o el cobro; el plan con su nombre
// comercial y sus condiciones. Sin número de habitación ni piso, sin
// descargar comprobante, calendario ni check-in online (decisiones de
// diseño). La clave de idempotencia ya se borró al registrar el resultado.

export function ConfirmacionPage() {
  useTituloPagina("Confirmación");
  const navigate = useNavigate();
  const { resultado, huesped, reiniciar } = useProcesoCompra();
  const [copiado, setCopiado] = useState(null); // null | "ok" | "error"

  useEffect(() => {
    if (copiado !== "ok") return undefined;
    const temporizador = setTimeout(() => setCopiado(null), 2500);
    return () => clearTimeout(temporizador);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resultado.codigoConfirmacion);
      setCopiado("ok");
    } catch {
      setCopiado("error");
    }
  }

  function nuevaReserva() {
    navigate("/web");
    reiniciar();
  }

  const habitaciones = resultado.habitaciones ?? [];
  const ocupacion = habitaciones.reduce(
    (acc, h) => ({ adultos: acc.adultos + Number(h.adultos || 0), menores: acc.menores + Number(h.menores || 0) }),
    { adultos: 0, menores: 0 }
  );
  const plan = resultado.plan;
  const garantia = resultado.garantia;
  const prepago = garantia?.tipo === "PREPAGO" || plan?.reembolsable === false;
  const enviado = resultado.email?.enviado;
  const linkMiReserva = `/web/mi-reserva?codigo=${encodeURIComponent(resultado.codigoConfirmacion)}`;

  return (
    <div className="ec-contenedor">
      <div className="ec-confirmacion">
        <span className="ec-confirmacion__icono">
          <Check size={44} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="ec-sobretitulo">Reserva confirmada</p>
        <h1 className="ec-titulo-pagina">¡Listo, te esperamos!</h1>

        {enviado === true && (
          <p className="ec-texto-2">
            Enviamos el comprobante a {huesped.email ? <strong>{huesped.email}</strong> : "tu email"}.
          </p>
        )}
        {resultado.email?.enCamino && (
          <p className="ec-texto-2">
            Te estamos enviando el comprobante a {huesped.email ? <strong>{huesped.email}</strong> : "tu email"}.
          </p>
        )}
        {enviado === false && (
          <div className="ec-alerta ec-alerta--aviso" role="status">
            <TriangleAlert size={20} strokeWidth={1.7} aria-hidden="true" />
            <div>
              <p className="ec-alerta__titulo">No pudimos enviarte el email de confirmación</p>
              <p>
                Tu reserva está hecha. Guardá este código: lo vas a necesitar, junto con tu email, para consultarla o cancelarla
                en Mi reserva.
              </p>
            </div>
          </div>
        )}

        <div className="ec-codigo">
          <span>Código de reserva</span>
          <span className="ec-codigo__valor">{resultado.codigoConfirmacion}</span>
          <Boton variante="claro" formulario onClick={copiar} aria-label="Copiar el código de reserva">
            <Copy size={18} strokeWidth={1.7} aria-hidden="true" /> {copiado === "ok" ? "Copiado" : "Copiar"}
          </Boton>
        </div>
        <p className="ec-texto-2 ec-chico" aria-live="polite">
          {copiado === "ok" && "Código copiado."}
          {copiado === "error" && "No pudimos copiarlo: anotalo a mano."}
        </p>

        <Tarjeta className="ec-detalle">
          <div className="ec-detalle-encabezado">
            <h2 className="ec-titulo-seccion">Detalle de la reserva</h2>
            <Insignia color="verde">{textoEstadoReserva(resultado)}</Insignia>
          </div>
          <div className="ec-detalle-grilla">
            <div>
              <p className="ec-resumen__etiqueta">{habitaciones.length > 1 ? "Habitaciones" : "Habitación"}</p>
              <p>{habitaciones.map((h) => h.tipo).join(" + ")}</p>
              {resultado.noches != null && <p className="ec-texto-2 ec-chico">{textoNoches(resultado.noches)}</p>}
            </div>
            <div>
              <p className="ec-resumen__etiqueta">Entrada</p>
              <p>{formatearFecha(resultado.fechaDesde)}</p>
              <p className="ec-texto-2 ec-chico">desde las {HOTEL.checkIn}</p>
            </div>
            <div>
              <p className="ec-resumen__etiqueta">Salida</p>
              <p>{formatearFecha(resultado.fechaHasta)}</p>
              <p className="ec-texto-2 ec-chico">hasta las {HOTEL.checkOut}</p>
            </div>
          </div>
          <div className="ec-detalle-grilla">
            <div>
              <p className="ec-resumen__etiqueta">Huéspedes</p>
              <p>{textoOcupacion(ocupacion)}</p>
              {huesped.nombres && (
                <p className="ec-texto-2 ec-chico">
                  Titular: {huesped.nombres} {huesped.apellido}
                </p>
              )}
            </div>
            <div>
              <p className="ec-resumen__etiqueta">Tarifa</p>
              <p>{nombreComercialPlan(plan)}</p>
              <p className="ec-texto-2 ec-chico">{textoCondicionesPlan(plan)}</p>
            </div>
            <div>
              <p className="ec-resumen__etiqueta">Pago</p>
              {garantia && (
                <p>
                  {prepago
                    ? `Cobrado ${formatearPrecio(resultado.cobradoAhora)} con ${textoTarjeta(garantia)}`
                    : `Garantizada con ${textoTarjeta(garantia)}`}
                </p>
              )}
              <p className="ec-texto-2 ec-chico">
                Total {formatearPrecio(resultado.total)}
                {prepago ? " · pagado" : " · no se cobró nada ahora"}
              </p>
            </div>
          </div>
        </Tarjeta>

        <div className="ec-fila">
          <Boton variante="secundario" to={linkMiReserva}>
            Ver mi reserva
          </Boton>
          <Boton onClick={nuevaReserva}>Volver al inicio</Boton>
        </div>
      </div>

      <section className="ec-seccion ec-pila" aria-labelledby="ec-antes-de-llegar">
        <h2 id="ec-antes-de-llegar" className="ec-titulo-seccion">
          Antes de llegar
        </h2>
        <div className="ec-grilla-2">
          <Tarjeta relleno className="ec-pila ec-pila--chica">
            <span className="ec-ventaja__icono">
              <MapPin size={22} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <h3>Cómo llegar</h3>
            <p className="ec-texto-2">{HOTEL.direccion}</p>
            <p className="ec-texto-2">
              Check-in desde las {HOTEL.checkIn} · check-out hasta las {HOTEL.checkOut}. Traé el documento que declaraste.
            </p>
          </Tarjeta>
          <Tarjeta relleno className="ec-pila ec-pila--chica">
            <span className="ec-ventaja__icono">
              <CalendarCheck size={22} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <h3>Cambios y cancelación</h3>
            {plan?.reembolsable ? (
              <>
                <p className="ec-texto-2">
                  Podés cancelar sin cargo desde Mi reserva hasta {plan.horasCancelacionSinCargo} h antes de la llegada, con tu
                  código y tu email.
                </p>
                <Boton variante="texto" to={linkMiReserva} style={{ alignSelf: "flex-start" }}>
                  Gestionar mi reserva <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
                </Boton>
              </>
            ) : (
              <p className="ec-texto-2">
                Esta tarifa no admite cancelación con devolución. Para cualquier consulta, contactá a recepción: {HOTEL.telefono}.
              </p>
            )}
          </Tarjeta>
        </div>
      </section>
    </div>
  );
}
