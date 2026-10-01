import { useState } from "react";
import { Search } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Insignia } from "../componentes/Insignia";
import { MensajeError } from "../componentes/MensajeError";
import { Tarjeta } from "../componentes/Tarjeta";
import { consultarMiReserva } from "../ecommerce.api";
import { formatearPrecio, formatearRangoFechas, textoCondicionesPlan } from "../formato";

// /web/mi-reserva — Responsable: Gimena. ESQUELETO: consulta con código de
// reserva + email (sin cuentas de huésped, sin "Modificar" ni "Completar
// pago"). Pendiente: cancelar con penalidad (cancelarMiReserva).
export function MiReservaPage() {
  const [codigo, setCodigo] = useState("");
  const [email, setEmail] = useState("");
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [reserva, setReserva] = useState(null);
  const [consultando, setConsultando] = useState(false);

  async function consultar(evento) {
    evento.preventDefault();
    const encontrados = {};
    if (!codigo.trim()) encontrados.codigo = "Ingresá el código de reserva.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) encontrados.email = "Ingresá un email válido.";
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;
    setConsultando(true);
    setError(null);
    setReserva(null);
    try {
      setReserva(await consultarMiReserva({ codigo: codigo.trim(), email: email.trim() }));
    } catch (err) {
      setError(err);
    } finally {
      setConsultando(false);
    }
  }

  return (
    <div className="ec-contenedor">
      <div className="ec-mi-reserva ec-pila">
        <p className="ec-sobretitulo">Mi reserva</p>
        <h1 className="ec-titulo-pagina">Consultá tu reserva</h1>
        <p className="ec-texto-2">Ingresá el código que recibiste por email y el email con el que reservaste.</p>
        <p className="ec-responsable">Esqueleto — Responsable: Gimena</p>

        <Tarjeta relleno>
          <form className="ec-pila" onSubmit={consultar} noValidate aria-label="Consultar reserva">
            <div className="ec-grilla-2">
              <Campo
                label="Código de reserva"
                requerido
                autoComplete="off"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                error={errores.codigo}
              />
              <Campo label="Email" type="email" requerido autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errores.email} />
            </div>
            <div>
              <Boton type="submit" formulario disabled={consultando}>
                <Search size={18} strokeWidth={1.8} aria-hidden="true" /> {consultando ? "Consultando…" : "Consultar"}
              </Boton>
            </div>
          </form>
        </Tarjeta>

        <MensajeError error={error} />

        {reserva && (
          <Tarjeta relleno className="ec-pila" aria-live="polite">
            <div className="ec-fila">
              <h2 className="ec-titulo-seccion">Reserva {reserva.codigoConfirmacion}</h2>
              <Insignia estado={reserva.estado} />
            </div>
            <p>{formatearRangoFechas(reserva.fechaDesde, reserva.fechaHasta)}</p>
            <p className="ec-texto-2">
              {reserva.habitaciones.map((h) => `Habitación ${h.tipo}`).join(" + ")} · Titular {reserva.titular}
            </p>
            <p>
              {reserva.plan.nombre} · <span className="ec-texto-2">{textoCondicionesPlan(reserva.plan)}</span>
            </p>
            <p>Total {formatearPrecio(reserva.total)}</p>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}
