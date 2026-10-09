import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Lock, Menu, X } from "lucide-react";
import "./ecommerce.css";
import { ProcesoCompraProvider } from "./ProcesoCompraContext";
import { HOTEL } from "./ecommerce.config";
import { Boton } from "./componentes/Boton";
import { BotonConsulta } from "./componentes/BotonConsulta";

// Rutas del proceso de compra: header reducido ("Pago seguro").
const RUTAS_COMPRA = ["/web/datos", "/web/pago"];

// Menú principal (rediseño): páginas propias y, como en el modelo, Servicios y Destino
// Salta como secciones del Inicio.
const MENU = [
  { texto: "Habitaciones", to: "/web/habitaciones" },
  { texto: "Experiencias", to: "/web/experiencias" },
  { texto: "Promociones", to: "/web/promociones" },
  { texto: "Servicios", to: "/web#servicios" },
  { texto: "Destino Salta", to: "/web#destino" },
];

// Cerros del logo (trazo dorado del modelo).
function MarcaCerros() {
  return (
    <svg className="ec-logo__cerros" viewBox="0 0 34 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M1 11l8-8 5 5 5-7 14 10" />
    </svg>
  );
}

// true cuando la página bajó más de 20 px (el encabezado fijo gana sombra).
function useBajoScroll() {
  const [bajo, setBajo] = useState(false);
  useEffect(() => {
    const revisar = () => setBajo(window.scrollY > 20);
    revisar();
    window.addEventListener("scroll", revisar, { passive: true });
    return () => window.removeEventListener("scroll", revisar);
  }, []);
  return bajo;
}

function Logo() {
  return (
    <Link to="/web" className="ec-logo" aria-label={`${HOTEL.nombre} ${HOTEL.bajada} — inicio`}>
      <MarcaCerros />
      <span className="ec-logo__nombre">{HOTEL.nombre}</span>
      <span className="ec-logo__bajada">{HOTEL.bajada}</span>
    </Link>
  );
}

function Header() {
  // El menú móvil se cierra al navegar: LayoutEcommerce le pasa key={pathname}.
  const [abierto, setAbierto] = useState(false);
  const bajo = useBajoScroll();

  const clases = ["ec-header", bajo ? "ec-header--scroll" : "", abierto ? "ec-header--menu-abierto" : ""].filter(Boolean).join(" ");
  return (
    <header className={clases}>
      <div className="ec-contenedor ec-header__interior">
        <Logo />
        <button
          type="button"
          className="ec-menu-boton"
          aria-expanded={abierto}
          aria-controls="ec-menu-principal"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? <X size={24} strokeWidth={1.7} aria-hidden="true" /> : <Menu size={24} strokeWidth={1.7} aria-hidden="true" />}
        </button>
        <nav id="ec-menu-principal" className="ec-nav" aria-label="Principal">
          {MENU.map((item) => (
            <Link key={item.to} className="ec-nav__link" to={item.to}>
              {item.texto}
            </Link>
          ))}
        </nav>
        <div className="ec-header__acciones">
          <Link className="ec-header__mi-reserva" to="/web/mi-reserva">
            Mi reserva
          </Link>
          <Boton variante="primario" className="ec-header__reservar" to="/web#buscar">
            Reservar
          </Boton>
        </div>
      </div>
    </header>
  );
}

function HeaderCompra() {
  return (
    <header className="ec-header">
      <div className="ec-contenedor ec-header__interior">
        <Logo />
        <p className="ec-header__seguro">
          <Lock size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>Pago seguro · conexión cifrada</span>
        </p>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="ec-footer" id="contacto">
      <div className="ec-contenedor">
        <div className="ec-footer__grilla">
          <div className="ec-footer__marca">
            <Logo />
            <p className="ec-footer__lema">Tu próxima historia comienza acá.</p>
          </div>
          <div>
            <h2 className="ec-footer__titulo">Hotel</h2>
            <ul className="ec-footer__lista">
              <li>
                <Link to="/web/habitaciones">Habitaciones</Link>
              </li>
              <li>
                <Link to="/web/promociones">Promociones</Link>
              </li>
              <li>
                <Link to="/web/experiencias">Experiencias</Link>
              </li>
              <li>
                <Link to="/web#servicios">Servicios</Link>
              </li>
              <li>
                <Link to="/web#ubicacion">Cómo llegar</Link>
              </li>
              <li>
                <Link to="/web/mi-reserva">Mi reserva</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="ec-footer__titulo">Contacto</h2>
            <ul className="ec-footer__lista">
              <li>
                {HOTEL.direccionCalle}
                <br />
                {HOTEL.direccionCiudad}
              </li>
              <li>
                Tel. <span>{HOTEL.telefono}</span>
              </li>
              <li>{HOTEL.email}</li>
              <li>Recepción {HOTEL.recepcion}</li>
            </ul>
          </div>
          <div>
            <h2 className="ec-footer__titulo">Información</h2>
            <ul className="ec-footer__lista">
              <li>Check-in: desde las {HOTEL.checkIn}</li>
              <li>Check-out: hasta las {HOTEL.checkOut}</li>
            </ul>
          </div>
        </div>
        <div className="ec-footer__pie">
          <span>© 2026 {HOTEL.nombre} {HOTEL.bajada}. Todos los derechos reservados.</span>
          <span>Precios finales en pesos argentinos (ARS), IVA incluido</span>
        </div>
        <p className="ec-footer__demo">Sitio de demostración · Proyecto académico de Sistemas III. Los datos de contacto son ficticios.</p>
      </div>
    </footer>
  );
}

// Envoltorio del sitio web nuevo. No usa el
// Layout del sistema: todo lo visual vive dentro de .ec-raiz.
export function LayoutEcommerce() {
  const { pathname, hash } = useLocation();
  const enCompra = RUTAS_COMPRA.includes(pathname);

  // Cada pantalla nueva arranca arriba (salvo links a una sección: #...).
  useEffect(() => {
    if (!hash) {
      window.scrollTo?.(0, 0);
      return;
    }
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ behavior: "smooth" });
  }, [pathname, hash]);

  return (
    <div className="ec-raiz">
      <a href="#ec-contenido" className="ec-visualmente-oculto">
        Saltar al contenido
      </a>
      {enCompra ? <HeaderCompra /> : <Header key={pathname} />}
      <ProcesoCompraProvider>
        <main id="ec-contenido" className="ec-main">
          <Outlet />
        </main>
      </ProcesoCompraProvider>
      {!enCompra && <Footer />}
      {!enCompra && <BotonConsulta />}
    </div>
  );
}
