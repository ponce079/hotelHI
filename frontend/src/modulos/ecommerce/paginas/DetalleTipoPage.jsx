import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Clock, FileText, Users } from "lucide-react";
import { Boton } from "../componentes/Boton";
import { FotoEjemplo } from "../componentes/FotoEjemplo";
import { MensajeError } from "../componentes/MensajeError";
import { Tarjeta } from "../componentes/Tarjeta";
import { obtenerTipos } from "../ecommerce.api";
import { HOTEL } from "../ecommerce.config";
import { contenidoDeTipo } from "../ecommerce.contenido";

// /web/habitacion/:tipoHabitacionId — Responsable: Gimena. ESQUELETO
// (mockup págs. 3 y 9): galería, descripción, comodidades y políticas del
// TIPO (sin número ni piso). Pendiente: panel de precios con fechas.
export function DetalleTipoPage() {
  const { tipoHabitacionId } = useParams();
  const tipos = useQuery({ queryKey: ["ecommerce", "tipos"], queryFn: obtenerTipos, retry: false });
  const tipo = tipos.data?.tipos.find((t) => String(t.tipoHabitacionId) === String(tipoHabitacionId));
  const contenido = contenidoDeTipo(tipo?.nombre);

  return (
    <div className="ec-contenedor">
      <nav className="ec-migas" aria-label="Migas de pan">
        <Link to="/web">Inicio</Link> <span aria-hidden="true">/</span>
        <Link to="/web#habitaciones">Habitaciones</Link> <span aria-hidden="true">/</span>
        <span aria-current="page">{tipo?.nombre ?? "Habitación"}</span>
      </nav>

      {tipos.isPending && <p className="ec-cargando">Cargando…</p>}
      {tipos.isError && <MensajeError error={tipos.error} />}
      {tipos.data && !tipo && (
        <div className="ec-pila">
          <h1 className="ec-titulo-pagina">Habitación no encontrada</h1>
          <Boton variante="secundario" to="/web">
            <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /> Volver al inicio
          </Boton>
        </div>
      )}

      {tipo && (
        <>
          <div className="ec-pila">
            <h1 className="ec-titulo-pagina">Habitación {tipo.nombre}</h1>
            <p className="ec-fila ec-texto-2">
              <Users size={18} strokeWidth={1.7} aria-hidden="true" /> Hasta {tipo.capacidadMaxima} personas
            </p>
          </div>

          <div className="ec-galeria">
            {contenido.fotos.map((texto, i) => (
              <FotoEjemplo key={texto} texto={i === 0 ? "Foto principal · Habitación" : texto} />
            ))}
          </div>

          <div className="ec-detalle__grilla">
            <div className="ec-pila">
              <p className="ec-responsable">Esqueleto — Responsable: Gimena</p>
              <h2 className="ec-titulo-seccion">Sobre la habitación</h2>
              <p className="ec-texto-2">{contenido.descripcionAmpliada}</p>

              <h2 className="ec-titulo-seccion">Comodidades</h2>
              <ul className="ec-chips" aria-label="Comodidades">
                {contenido.comodidades.map(({ nombre, Icono }) => (
                  <li key={nombre} className="ec-chip">
                    <Icono size={18} strokeWidth={1.6} aria-hidden="true" /> {nombre}
                  </li>
                ))}
              </ul>

              <h2 className="ec-titulo-seccion">Políticas de la estadía</h2>
              <div>
                <div className="ec-politica">
                  <Clock size={20} strokeWidth={1.7} aria-hidden="true" />
                  <div>
                    <p className="ec-resumen__valor">Check-in y check-out</p>
                    <p className="ec-texto-2">
                      Entrada desde las {HOTEL.checkIn} · salida hasta las {HOTEL.checkOut}
                    </p>
                  </div>
                </div>
                <div className="ec-politica">
                  <CalendarDays size={20} strokeWidth={1.7} aria-hidden="true" />
                  <div>
                    <p className="ec-resumen__valor">Cancelación</p>
                    <p className="ec-texto-2">Depende de la tarifa que elijas: cada una muestra sus condiciones antes de reservar.</p>
                  </div>
                </div>
                <div className="ec-politica">
                  <FileText size={20} strokeWidth={1.7} aria-hidden="true" />
                  <div>
                    <p className="ec-resumen__valor">Documentación</p>
                    <p className="ec-texto-2">DNI o pasaporte de cada huésped al momento del check-in.</p>
                  </div>
                </div>
              </div>
            </div>

            <Tarjeta relleno className="ec-pila">
              <h2 className="ec-titulo-seccion">Precios para tus fechas</h2>
              <p className="ec-texto-2">Elegí tus fechas y la cantidad de huéspedes para ver las tarifas y el total de tu estadía.</p>
              <Boton to="/web/resultados" bloque>
                Ver disponibilidad
              </Boton>
            </Tarjeta>
          </div>
        </>
      )}
    </div>
  );
}
