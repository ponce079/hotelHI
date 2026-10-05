import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { Insignia } from "../componentes/Insignia";
import { Tarjeta } from "../componentes/Tarjeta";
import { HOTEL } from "../ecommerce.config";
import { formatearFecha, formatearPrecio, textoCondicionesPlan, textoEstadoReserva, textoOcupacion } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";

// /web/confirmacion — Responsable: Tomás. ESQUELETO con el layout correcto
// (mockup pág. 6, con las decisiones de diseño: sin número de habitación,
// sin descargar comprobante, sin agregar al calendario, sin check-in
// online). El código es el que devuelve la API. La clave de idempotencia ya
// se borró al registrar el resultado. Ver docs/ecommerce/CONTRATO.md.
export function ConfirmacionPage() {
  const navigate = useNavigate();
  const { resultado, huesped, reiniciar } = useProcesoCompra();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resultado.codigoConfirmacion);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  function nuevaReserva() {
    navigate("/web");
    reiniciar();
  }

  const ocupacion = (resultado.habitaciones ?? []).reduce(
    (acc, h) => ({ adultos: acc.adultos + h.adultos, menores: acc.menores + h.menores }),
    { adultos: 0, menores: 0 }
  );

  return (
    <div className="ec-contenedor">
      <div className="ec-confirmacion">
        <span className="ec-confirmacion__icono">
          <Check size={44} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="ec-sobretitulo">Reserva confirmada</p>
        <h1 className="ec-titulo-pagina">¡Listo, te esperamos!</h1>
        {resultado.email?.enviado && (
          <p className="ec-texto-2">Enviamos la confirmación a {huesped.email ? <strong>{huesped.email}</strong> : "tu email"}.</p>
        )}
        <div className="ec-codigo">
          <span>Código de reserva</span>
          <span className="ec-codigo__valor">{resultado.codigoConfirmacion}</span>
          <Boton variante="claro" formulario onClick={copiar} aria-label="Copiar el código de reserva">
            <Copy size={18} strokeWidth={1.7} aria-hidden="true" /> {copiado ? "Copiado" : "Copiar"}
          </Boton>
        </div>
        <p className="ec-responsable">Responsable: Tomás — ver docs/ecommerce/CONTRATO.md</p>

        <Tarjeta className="ec-detalle">
          <div className="ec-detalle-encabezado">
            <h2 className="ec-titulo-seccion">Detalle de la reserva</h2>
            <Insignia color="verde">{textoEstadoReserva(resultado)}</Insignia>
          </div>
          <div className="ec-detalle-grilla">
            <div>
              <p className="ec-resumen__etiqueta">Habitación</p>
              <p>{(resultado.habitaciones ?? []).map((h) => h.tipo).join(" + ")}</p>
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
            </div>
            <div>
              <p className="ec-resumen__etiqueta">Tarifa</p>
              <p>{resultado.plan?.nombre}</p>
              <p className="ec-texto-2 ec-chico">{textoCondicionesPlan(resultado.plan)}</p>
            </div>
            <div>
              <p className="ec-resumen__etiqueta">Pago</p>
              {resultado.garantia && (
                <p>
                  Tarjeta {resultado.garantia.marca} terminada en {resultado.garantia.ultimos4}
                </p>
              )}
              <p>Total {formatearPrecio(resultado.total)}</p>
              <p className="ec-texto-2 ec-chico">Cobrado ahora: {formatearPrecio(resultado.cobradoAhora)}</p>
            </div>
          </div>
        </Tarjeta>

        <div className="ec-fila">
          <Boton variante="secundario" to="/web/mi-reserva">
            Ver mi reserva
          </Boton>
          <Boton onClick={nuevaReserva}>Volver al inicio</Boton>
        </div>
      </div>
    </div>
  );
}
