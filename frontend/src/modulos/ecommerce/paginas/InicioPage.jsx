import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Check, Clock, MapPin, ShieldCheck, User } from "lucide-react";
import { BuscadorEstadia } from "../componentes/BuscadorEstadia";
import { Boton } from "../componentes/Boton";
import { FotoEjemplo } from "../componentes/FotoEjemplo";
import { Insignia } from "../componentes/Insignia";
import { MensajeError } from "../componentes/MensajeError";
import { Tarjeta } from "../componentes/Tarjeta";
import { obtenerTipos } from "../ecommerce.api";
import { HOTEL } from "../ecommerce.config";
import { contenidoDeTipo } from "../ecommerce.contenido";
import { busquedaComoQuery } from "../formato";
import { useProcesoCompra } from "../ProcesoCompraContext";

// /web — Responsable: Gimena. Mockup págs. 1 (escritorio) y 8 (móvil), con
// las decisiones de diseño: sin precios hasta buscar, sin servicios
// adicionales, sin cuentas, solo tarjeta de crédito.
const VENTAJAS = [
  { Icono: Check, titulo: "Confirmación inmediata", texto: "Tu reserva queda registrada al instante y recibís la confirmación por email." },
  { Icono: ShieldCheck, titulo: "Pago seguro", texto: "Con tarjeta de crédito. Tus datos viajan cifrados." },
  {
    Icono: CalendarDays,
    titulo: "Consultá tu reserva",
    texto: "Con tu código y tu email, desde Mi reserva, podés verla o cancelarla según la política de tu tarifa.",
  },
];

export function InicioPage() {
  const navigate = useNavigate();
  const { fechaDesde, fechaHasta, ocupacion, definirBusqueda } = useProcesoCompra();
  const tipos = useQuery({ queryKey: ["ecommerce", "tipos"], queryFn: obtenerTipos, retry: false });

  function buscar(valores) {
    definirBusqueda({
      fechaDesde: valores.fechaDesde,
      fechaHasta: valores.fechaHasta,
      ocupacion: [{ adultos: valores.adultos, menores: valores.menores }],
    });
    navigate(`/web/resultados?${busquedaComoQuery(valores)}`);
  }

  return (
    <>
      <section className="ec-hero">
        <div className="ec-contenedor ec-hero__grilla">
          <div className="ec-hero__texto">
            <p className="ec-sobretitulo">Hotel · Reserva directa</p>
            <h1>Tu estadía, resuelta en minutos.</h1>
            <p className="ec-hero__bajada">
              Elegí tus fechas, mirá las habitaciones disponibles y confirmá tu reserva con tu tarjeta de crédito.
            </p>
            <div className="ec-hero__sellos">
              <span className="ec-hero__sello">
                <Check size={18} strokeWidth={1.8} aria-hidden="true" /> Confirmación inmediata
              </span>
              <span className="ec-hero__sello">
                <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" /> Pago seguro
              </span>
            </div>
          </div>
          <div className="ec-hero__foto">
            <FotoEjemplo texto="Foto · Fachada o lobby del hotel · 16:9" />
          </div>
        </div>
      </section>

      <div className="ec-contenedor ec-hero__buscador">
        <BuscadorEstadia
          valoresIniciales={{ fechaDesde, fechaHasta, adultos: ocupacion[0]?.adultos, menores: ocupacion[0]?.menores }}
          onBuscar={buscar}
        />
      </div>

      <section id="habitaciones" className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-habitaciones">
        <div className="ec-seccion__encabezado">
          <div>
            <p className="ec-sobretitulo">Habitaciones</p>
            <h2 id="ec-titulo-habitaciones">Dos categorías, un mismo estándar.</h2>
          </div>
        </div>
        {tipos.isPending && <p className="ec-cargando">Cargando habitaciones…</p>}
        {tipos.isError && <MensajeError error={tipos.error} />}
        {tipos.data && (
          <div className="ec-grilla-tipos">
            {tipos.data.tipos.map((tipo) => {
              const contenido = contenidoDeTipo(tipo.nombre);
              return (
                <Tarjeta como="article" key={tipo.tipoHabitacionId} className="ec-tipo-card">
                  <FotoEjemplo texto={contenido.fotos[0]} />
                  <div className="ec-tipo-card__cuerpo">
                    <div className="ec-tipo-card__titulo">
                      <h3>{tipo.nombre}</h3>
                      <Insignia color="verde">Hasta {tipo.capacidadMaxima} personas</Insignia>
                    </div>
                    <p className="ec-texto-2">{contenido.descripcion}</p>
                    <ul className="ec-chips" aria-label="Comodidades">
                      {contenido.comodidades.map(({ nombre, Icono }) => (
                        <li key={nombre} className="ec-chip">
                          <Icono size={18} strokeWidth={1.6} aria-hidden="true" /> {nombre}
                        </li>
                      ))}
                    </ul>
                    <div className="ec-tipo-card__pie">
                      <Boton variante="secundario" to={`/web/habitacion/${tipo.tipoHabitacionId}`}>
                        Ver habitación <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
                      </Boton>
                    </div>
                  </div>
                </Tarjeta>
              );
            })}
          </div>
        )}
      </section>

      <section className="ec-ventajas" aria-labelledby="ec-titulo-ventajas">
        <div className="ec-contenedor ec-ventajas__grilla">
          <div>
            <p className="ec-sobretitulo">Reservá directo</p>
            <h2 id="ec-titulo-ventajas">Sin intermediarios, todo desde acá.</h2>
          </div>
          {VENTAJAS.map(({ Icono, titulo, texto }) => (
            <div key={titulo} className="ec-ventaja">
              <span className="ec-ventaja__icono">
                <Icono size={24} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <p className="ec-ventaja__titulo">{titulo}</p>
              <p className="ec-texto-2">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="ubicacion" className="ec-contenedor ec-seccion" aria-labelledby="ec-titulo-ubicacion">
        <Tarjeta className="ec-ubicacion">
          <FotoEjemplo texto="Mapa · Ubicación del hotel" />
          <div className="ec-ubicacion__datos">
            <p className="ec-sobretitulo">Ubicación</p>
            <h2 id="ec-titulo-ubicacion">Cómo llegar</h2>
            <div className="ec-dato">
              <MapPin size={20} strokeWidth={1.7} aria-hidden="true" />
              <span className="ec-dato__etiqueta">Dirección</span>
              <span className="ec-dato__valor">{HOTEL.direccion}</span>
            </div>
            <div className="ec-dato">
              <Clock size={20} strokeWidth={1.7} aria-hidden="true" />
              <span className="ec-dato__etiqueta">Check-in</span>
              <span className="ec-dato__valor">Desde las {HOTEL.checkIn}</span>
            </div>
            <div className="ec-dato">
              <Clock size={20} strokeWidth={1.7} aria-hidden="true" />
              <span className="ec-dato__etiqueta">Check-out</span>
              <span className="ec-dato__valor">Hasta las {HOTEL.checkOut}</span>
            </div>
            <div className="ec-dato">
              <User size={20} strokeWidth={1.7} aria-hidden="true" />
              <span className="ec-dato__etiqueta">Recepción</span>
              <span className="ec-dato__valor">{HOTEL.telefono}</span>
            </div>
          </div>
        </Tarjeta>
      </section>
    </>
  );
}
