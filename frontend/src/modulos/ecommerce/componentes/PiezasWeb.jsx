import { CalendarCheck, CalendarDays, Check, Clock, Lock, Minus, Receipt, ShieldCheck, Users } from "lucide-react";
import { Boton } from "./Boton";
import { CONFIANZA_WEB, EXPERIENCIAS_SALTA, ITINERARIO_SALTA, contenidoDeTipo, fotoDeTipo, fotoWeb } from "../ecommerce.contenido";

// Piezas compartidas del rediseño "Holiday Inn Salta" (Inicio, Habitaciones,
// Promociones, Experiencias). Estilos en ecommerce.css (sección "Rediseño").

// Foto que llena su contenedor; `nombre` es una foto de public/web/fotos.
export function FotoWeb({ nombre, src, alt = "" }) {
  return <img className="ec-foto-real" src={src ?? fotoWeb(nombre)} alt={alt} loading="lazy" />;
}

// Portada con foto, velo cálido y título. `chica` = la de las páginas internas.
export function Portada({ foto, titulo, bajada, sobretitulo, idTitulo, chica = false, children }) {
  return (
    <section className={`ec-portada ${chica ? "ec-portada--chica" : ""}`.trim()} aria-labelledby={idTitulo}>
      <img className="ec-portada__foto" src={fotoWeb(foto)} alt="" />
      <div className="ec-contenedor ec-portada__texto">
        {sobretitulo && <p className="ec-portada__sobretitulo">{sobretitulo}</p>}
        <h1 id={idTitulo}>{titulo}</h1>
        {bajada && <p className="ec-portada__bajada">{bajada}</p>}
        {children}
      </div>
    </section>
  );
}

// Tarjeta de un tipo de habitación (de /api/web/tipos): sin precio, que depende de las fechas.
export function TarjetaHabitacionWeb({ tipo, demora = 0 }) {
  const contenido = contenidoDeTipo(tipo.nombre);
  return (
    <article className="ec-habitacion ec-revelar" style={{ transitionDelay: `${demora}ms` }}>
      <div className="ec-habitacion__foto">
        {contenido.destacada && <span className="ec-habitacion__etiqueta">{contenido.destacada}</span>}
        <FotoWeb src={fotoDeTipo(tipo.nombre)} alt={`Habitación ${tipo.nombre}`} />
      </div>
      <div className="ec-habitacion__cuerpo">
        <h3>{tipo.nombre}</h3>
        <p className="ec-habitacion__meta">
          <Users size={14} strokeWidth={1.6} aria-hidden="true" /> Hasta {tipo.capacidadMaxima} personas
        </p>
        <p className="ec-texto-2 ec-chico">{contenido.descripcion}</p>
        <ul className="ec-comodidades" aria-label="Comodidades">
          {contenido.comodidades.map(({ nombre, Icono }) => (
            <li key={nombre} title={nombre}>
              <Icono size={15} strokeWidth={1.6} aria-hidden="true" />
              <span>{nombre}</span>
            </li>
          ))}
        </ul>
        <Boton to={`/web/habitacion/${tipo.tipoHabitacionId}`} className="ec-habitacion__boton" aria-label={`Ver habitación ${tipo.nombre}`}>
          Ver detalles
        </Boton>
      </div>
    </article>
  );
}

// Tarjeta de una promoción (contenido de difusión: el precio lo calcula el motor).
// `destacada` = la versión grande, con la foto al costado.
export function TarjetaPromo({ promo, demora = 0, destino = "/web#buscar", destacada = false }) {
  return (
    <article className={`ec-promo ec-revelar ${destacada ? "ec-promo--destacada" : ""}`.trim()} style={{ transitionDelay: `${demora}ms` }}>
      <div className="ec-promo__foto">
        <span className="ec-promo__etiqueta">{promo.etiqueta}</span>
        <FotoWeb nombre={promo.foto} />
      </div>
      <div className="ec-promo__cuerpo">
        {destacada && <p className="ec-promo__aviso">Promoción destacada</p>}
        <h3>{promo.titulo}</h3>
        <p className="ec-promo__beneficio">{promo.beneficio}</p>
        <p className="ec-texto-2 ec-chico">{promo.detalle}</p>
        {promo.vigencia && (
          <p className="ec-promo__vigencia">
            <CalendarDays size={13} strokeWidth={1.7} aria-hidden="true" /> {promo.vigencia}
          </p>
        )}
        {promo.condiciones && (
          <details className="ec-promo__condiciones">
            <summary>Ver condiciones</summary>
            <ul>
              {promo.condiciones.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
        )}
        <Boton to={destino} className="ec-promo__boton">
          Ver disponibilidad
        </Boton>
      </div>
    </article>
  );
}

// Lista de experiencias en Salta (Excursiones, Cultura, Gastronomía, Naturaleza).
export function ListaExperiencias({ className = "" }) {
  return (
    <ul className={`ec-experiencias ${className}`.trim()}>
      {EXPERIENCIAS_SALTA.map(({ nombre, texto, Icono }) => (
        <li key={nombre} className="ec-experiencia ec-revelar">
          <Icono size={22} strokeWidth={1.4} aria-hidden="true" />
          <span>
            <span className="ec-experiencia__nombre">{nombre}</span>
            <span className="ec-texto-2 ec-chico">{texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Franja con lo que asegura reservar directo (datos reales del sitio).
const ICONOS_CONFIANZA = [Receipt, ShieldCheck, CalendarCheck, Lock];
export function FranjaConfianza() {
  return (
    <ul className="ec-confianza" aria-label="Por qué reservar directo">
      {CONFIANZA_WEB.map(({ titulo, texto }, i) => {
        const Icono = ICONOS_CONFIANZA[i];
        return (
          <li key={titulo} className="ec-revelar" style={{ transitionDelay: `${i * 80}ms` }}>
            <Icono size={22} strokeWidth={1.4} aria-hidden="true" />
            <span>
              <span className="ec-confianza__titulo">{titulo}</span>
              <span className="ec-confianza__texto">{texto}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Excursión o paseo con foto libre (Wikimedia Commons) y su crédito de autor y licencia.
export function TarjetaExcursion({ excursion, demora = 0 }) {
  const { nombre, tipo, duracion, texto, foto, credito } = excursion;
  return (
    <article className="ec-excursion ec-revelar" style={{ transitionDelay: `${demora}ms` }}>
      <div className="ec-excursion__foto">
        <span className="ec-promo__etiqueta">{tipo}</span>
        <FotoWeb nombre={foto} alt={nombre} />
      </div>
      <div className="ec-excursion__cuerpo">
        <h3>{nombre}</h3>
        <p className="ec-habitacion__meta">
          <Clock size={14} strokeWidth={1.6} aria-hidden="true" /> {duracion}
        </p>
        <p className="ec-texto-2 ec-chico">{texto}</p>
        <p className="ec-excursion__credito">
          Foto:{" "}
          <a href={credito.pagina} target="_blank" rel="noreferrer">
            {credito.autor}
          </a>{" "}
          · {credito.licencia}
        </p>
      </div>
    </article>
  );
}

// Itinerario sugerido de tres días.
export function Itinerario() {
  return (
    <ol className="ec-itinerario">
      {ITINERARIO_SALTA.map(({ dia, titulo, momentos }, i) => (
        <li key={dia} className="ec-itinerario__dia ec-revelar" style={{ transitionDelay: `${i * 120}ms` }}>
          <span className="ec-itinerario__numero" aria-hidden="true">
            {i + 1}
          </span>
          <p className="ec-itinerario__nombre">{dia}</p>
          <h3>{titulo}</h3>
          <dl>
            {momentos.map(({ hora, texto }) => (
              <div key={hora}>
                <dt>{hora}</dt>
                <dd>{texto}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

// Tabla para comparar las categorías: capacidad y comodidades de cada una.
export function TablaComparativa({ tipos }) {
  const contenidos = tipos.map((tipo) => contenidoDeTipo(tipo.nombre));
  const comodidades = [...new Set(contenidos.flatMap((c) => c.comodidades.map((x) => x.nombre)))];
  return (
    <div className="ec-comparar ec-revelar">
      <table>
        <caption className="ec-solo-lectores">Comparación de habitaciones</caption>
        <thead>
          <tr>
            <th scope="col">Habitación</th>
            {tipos.map((tipo) => (
              <th key={tipo.tipoHabitacionId} scope="col">
                {tipo.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Capacidad</th>
            {tipos.map((tipo) => (
              <td key={tipo.tipoHabitacionId}>Hasta {tipo.capacidadMaxima} personas</td>
            ))}
          </tr>
          {comodidades.map((nombre) => (
            <tr key={nombre}>
              <th scope="row">{nombre}</th>
              {contenidos.map((c, i) => {
                const tiene = c.comodidades.some((x) => x.nombre === nombre);
                return (
                  <td key={tipos[i].tipoHabitacionId}>
                    {tiene ? (
                      <Check size={16} strokeWidth={2} className="ec-comparar__si" aria-hidden="true" />
                    ) : (
                      <Minus size={16} strokeWidth={1.5} className="ec-comparar__no" aria-hidden="true" />
                    )}
                    <span className="ec-solo-lectores">{tiene ? "Sí" : "No"}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
